package com.example.android_project.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.android_project.R
import com.example.android_project.data.NotificationRepository
import com.example.android_project.model.AppNotification
import com.example.android_project.ui.main.MainTabsActivity
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import java.util.concurrent.TimeUnit

/**
 * 앱이 꺼져 있어도 폰 알림창에 알림을 띄운다.
 * 15분마다(안드로이드가 허용하는 최소 간격) 서버에서 읽지 않은 알림을 가져와서,
 * 지난번 확인 이후에 새로 생긴 것만 알림창에 올린다.
 */
object PhoneNotifications {

    private const val CHANNEL_ID = "roomade_default"
    private const val WORK_NAME = "roomade_notification_check"
    private const val PREFS = "roomade_notification"
    private const val KEY_LAST_ID = "last_notified_id"

    fun start(context: Context) {
        // 푸시가 켜진 빌드에서는 서버가 바로 보내주므로 주기 확인을 하지 않는다.
        if (PushRegistration.isAvailable(context)) {
            PushRegistration.register(context)
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<CheckWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** 로그아웃·세션 만료 때 호출한다. 다음 사람이 로그인했을 때 이전 기준값이 남지 않게 지운다. */
    fun stop(context: Context) {
        val app = context.applicationContext
        PushRegistration.unregister(app)
        WorkManager.getInstance(app).cancelUniqueWork(WORK_NAME)
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "룸메이드 알림", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "유통기한, 청소, 일정 등 방 생활 알림"
                }
            )
        }
    }

    private fun show(context: Context, n: AppNotification) =
        show(context, n.notificationId, n.title, n.body, n.target?.type)

    fun show(context: Context, id: Int, title: String, body: String, targetType: String?) {
        if (!hasPermission(context)) return
        ensureChannel(context)

        val tab = when (targetType) {
            "ITEM" -> MainTabsActivity.TAB_WAREHOUSE
            "SCHEDULE", "CLEANING_TASK" -> MainTabsActivity.TAB_CALENDAR
            else -> MainTabsActivity.TAB_HOME
        }
        val intent = Intent(context, MainTabsActivity::class.java)
            .putExtra(MainTabsActivity.EXTRA_TAB, tab)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bell)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // 허용이 막 해제된 경우. 다음 확인 때 다시 시도하지 않는다.
        }
    }

    class CheckWorker(private val context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

        override suspend fun doWork(): Result {
            if (TokenManager(context).getToken() == null) return Result.success()

            return try {
                val response = NotificationRepository(context).list("unread", 30, null)
                    ?: return Result.success()
                if (!response.isSuccessful) return Result.success()

                val gson = Gson()
                val list = response.body()?.getAsJsonArray("notifications")
                    ?.map { gson.fromJson(it, AppNotification::class.java) }
                    .orEmpty()

                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val maxId = list.maxOfOrNull { it.notificationId } ?: 0

                if (!prefs.contains(KEY_LAST_ID)) {
                    // 처음 확인할 때는 예전 알림을 한꺼번에 띄우지 않고 기준만 잡는다.
                    prefs.edit().putInt(KEY_LAST_ID, maxId).apply()
                    return Result.success()
                }

                val lastId = prefs.getInt(KEY_LAST_ID, 0)
                list.filter { it.notificationId > lastId }
                    .sortedBy { it.notificationId }
                    .forEach { show(context, it) }

                if (maxId > lastId) prefs.edit().putInt(KEY_LAST_ID, maxId).apply()
                Result.success()
            } catch (e: Exception) {
                // 서버에 닿지 않으면(PC가 꺼져 있는 등) 다음 주기에 다시 확인한다.
                Result.success()
            }
        }
    }
}
