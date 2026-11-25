package com.example.android_project.ui

import android.content.Context
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatActivity
import com.example.android_project.util.AppSettings
import com.example.android_project.util.Msg

/** 모든 화면의 바탕. 설정에서 고른 글자 크기를 적용하고, 닫힌 화면에서 넘어온 안내 메시지를 보여준다. */
open class BaseActivity : AppCompatActivity() {

    override fun attachBaseContext(newBase: Context) {
        val config = Configuration(newBase.resources.configuration)
        config.fontScale = AppSettings.fontSize(newBase).scale
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    override fun onResume() {
        super.onResume()
        Msg.showPending(this)
    }

    override fun finish() {
        Msg.handOver(this)
        super.finish()
    }
}