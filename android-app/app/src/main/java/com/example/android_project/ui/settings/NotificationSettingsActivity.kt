package com.example.android_project.ui.settings

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.CompoundButton
import android.widget.TextView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.NotificationRepository
import com.example.android_project.notification.PhoneNotifications
import com.example.android_project.ui.BaseActivity
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/** 알림 종류별로 폰 푸시를 켜고 끈다. (끈 알림도 앱 안 알림 목록에는 쌓인다.) */
class NotificationSettingsActivity : BaseActivity() {

    private lateinit var repo: NotificationRepository
    private lateinit var switches: Map<String, MaterialSwitch>
    private lateinit var tvPermission: TextView
    private var loaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notification_settings)
        repo = NotificationRepository(this)

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        tvPermission = findViewById(R.id.tvPermissionHint)
        tvPermission.setOnClickListener {
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            )
        }

        switches = mapOf(
            "itemExpiry" to findViewById(R.id.swItemExpiry),
            "cleaning" to findViewById(R.id.swCleaning),
            "schedule" to findViewById(R.id.swSchedule),
            "expense" to findViewById(R.id.swExpense)
        )
        // 서버 설정을 불러오기 전에는 건드리지 못하게 한다.
        switches.values.forEach { it.isEnabled = false }

        load()
    }

    override fun onResume() {
        super.onResume()
        tvPermission.visibility = if (PhoneNotifications.hasPermission(this)) View.GONE else View.VISIBLE
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val response = repo.getSettings() ?: return@launch
                if (!response.isSuccessful) {
                    toast("알림 설정을 불러오지 못했어요.")
                    return@launch
                }
                val settings = response.body()?.getAsJsonObject("settings") ?: return@launch
                switches.forEach { (key, sw) ->
                    sw.isChecked = settings.get(key)?.asBoolean ?: true
                    sw.isEnabled = true
                    sw.setOnCheckedChangeListener(listener(key))
                }
                loaded = true
            } catch (e: Exception) {
                toast("서버에 연결할 수 없어요.")
            }
        }
    }

    private fun listener(key: String): CompoundButton.OnCheckedChangeListener = CompoundButton.OnCheckedChangeListener { button, checked ->
        lifecycleScope.launch {
            try {
                val body = JsonObject().apply { addProperty(key, checked) }
                val response = repo.updateSettings(body)
                if (response == null || !response.isSuccessful) throw IllegalStateException()
            } catch (e: Exception) {
                // 저장하지 못하면 스위치를 원래대로 돌려 놓는다.
                button.setOnCheckedChangeListener(null)
                button.isChecked = !checked
                button.setOnCheckedChangeListener(listener(key))
                toast("저장하지 못했어요.")
            }
        }
    }

    private fun toast(msg: String) = com.example.android_project.util.Msg.makeText(this, msg, Toast.LENGTH_SHORT).show()
}