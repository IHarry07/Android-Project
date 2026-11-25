package com.example.android_project.notification

import android.content.Context
import com.example.android_project.data.RetrofitClient
import com.example.android_project.util.TokenManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.gson.JsonObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 푸시 알림(FCM) 등록. app/google-services.json 이 없는 빌드에서는 Firebase가 켜지지 않으므로 아무것도 하지 않는다.
 * 켜져 있으면 서버가 알림을 만드는 즉시 폰으로 푸시를 보내므로, 15분 주기 확인은 쓰지 않는다.
 */
object PushRegistration {

    private const val PREFS = "roomade_push"
    private const val KEY_TOKEN = "fcm_token"

    fun isAvailable(context: Context): Boolean =
        FirebaseApp.getApps(context.applicationContext).isNotEmpty()

    /** 로그인한 상태에서 앱을 열 때마다 호출한다. 서버에 이 기기의 토큰을 (다시) 알린다. */
    fun register(context: Context) {
        val app = context.applicationContext
        if (!isAvailable(app)) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> send(app, token) }
    }

    fun send(context: Context, token: String) {
        val app = context.applicationContext
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply()
        val auth = TokenManager(app).getToken() ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                RetrofitClient.notificationApiService.registerDevice("Bearer $auth", body(token))
            } catch (_: Exception) {
                // 다음에 앱을 열 때 다시 등록한다.
            }
        }
    }

    /** 로그아웃·세션 만료 때: 이 기기로 더 이상 이전 계정의 푸시가 오지 않게 한다. */
    fun unregister(context: Context) {
        val app = context.applicationContext
        val token = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null) ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                RetrofitClient.notificationApiService.unregisterDevice(body(token))
            } catch (_: Exception) {
            }
        }
    }

    private fun body(token: String) = JsonObject().apply { addProperty("token", token) }
}