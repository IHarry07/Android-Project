package com.example.android_project.ui.settings

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import com.example.android_project.BuildConfig
import com.example.android_project.R
import com.example.android_project.ui.BaseActivity
import com.example.android_project.ui.TermsActivity
import com.example.android_project.util.AppSettings

/** 설정: 알림 설정, 화면 모드, 글자 크기, 이용약관, 앱 버전. */
class SettingsActivity : BaseActivity() {

    private lateinit var tvTheme: TextView
    private lateinit var tvFont: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        tvTheme = findViewById(R.id.tvThemeValue)
        tvFont = findViewById(R.id.tvFontValue)
        findViewById<TextView>(R.id.tvVersion).text = BuildConfig.VERSION_NAME

        findViewById<android.view.View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<android.view.View>(R.id.rowNotification).setOnClickListener {
            startActivity(Intent(this, NotificationSettingsActivity::class.java))
        }
        findViewById<android.view.View>(R.id.rowTerms).setOnClickListener {
            startActivity(Intent(this, TermsActivity::class.java))
        }
        findViewById<android.view.View>(R.id.rowPrivacy).setOnClickListener {
            startActivity(TermsActivity.privacyIntent(this))
        }
        findViewById<android.view.View>(R.id.rowNotices).setOnClickListener {
            startActivity(Intent(this, com.example.android_project.ui.notice.NoticeListActivity::class.java))
        }
        findViewById<android.view.View>(R.id.tvWithdraw).setOnClickListener {
            startActivity(Intent(this, com.example.android_project.ui.settings.WithdrawActivity::class.java))
        }
        findViewById<android.view.View>(R.id.rowTheme).setOnClickListener { chooseTheme() }
        findViewById<android.view.View>(R.id.rowFont).setOnClickListener { chooseFont() }

        val swRepeat = findViewById<com.google.android.material.materialswitch.MaterialSwitch>(R.id.swRepeatCleaning)
        swRepeat.isChecked = AppSettings.showRepeatingCleaning(this)
        swRepeat.setOnCheckedChangeListener { _, checked -> AppSettings.setShowRepeatingCleaning(this, checked) }

        loadPhotoVisibility()
        showValues()
    }

    // 프로필 사진 공개 여부는 서버에 저장된다. 불러오기 전에는 건드리지 못하게 한다.
    private fun loadPhotoVisibility() {
        val sw = findViewById<com.google.android.material.materialswitch.MaterialSwitch>(R.id.swPhotoPublic)
        val repo = com.example.android_project.data.UserRepository(this)
        lifecycleScope.launch {
            try {
                val me = repo.getMe()?.body()?.getAsJsonObject("user") ?: return@launch
                sw.isChecked = me.get("photoPublic")?.asBoolean ?: true
                sw.isEnabled = true
                sw.setOnCheckedChangeListener { button, checked ->
                    lifecycleScope.launch {
                        try {
                            val r = repo.setPhotoVisibility(checked)
                            if (r == null || !r.isSuccessful) throw IllegalStateException()
                        } catch (e: Exception) {
                            button.setOnCheckedChangeListener(null)
                            button.isChecked = !checked
                            com.example.android_project.util.Msg.show(this@SettingsActivity, "저장하지 못했어요.")
                        }
                    }
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.show(this@SettingsActivity, "서버에 연결할 수 없어요.")
            }
        }
    }



    private fun showValues() {
        tvTheme.text = AppSettings.theme(this).label
        tvFont.text = AppSettings.fontSize(this).label
    }

    private fun chooseTheme() {
        val options = AppSettings.Theme.values()
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("화면 모드")
            .setSingleChoiceItems(options.map { it.label }.toTypedArray(), AppSettings.theme(this).ordinal) { dialog, which ->
                dialog.dismiss()
                // 모드가 바뀌면 열려 있는 화면이 자동으로 다시 그려진다.
                AppSettings.setTheme(this, options[which])
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun chooseFont() {
        val options = AppSettings.FontSize.values()
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("글자 크기")
            .setSingleChoiceItems(options.map { it.label }.toTypedArray(), AppSettings.fontSize(this).ordinal) { dialog, which ->
                dialog.dismiss()
                AppSettings.setFontSize(this, options[which])
                recreate()
            }
            .setNegativeButton("취소", null)
            .show()
    }
}