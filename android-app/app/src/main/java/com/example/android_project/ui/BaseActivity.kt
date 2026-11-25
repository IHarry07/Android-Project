package com.example.android_project.ui

import android.content.Context
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatActivity
import com.example.android_project.util.AppSettings
import com.example.android_project.util.Msg

/** 모든 화면의 바탕. 설정에서 고른 글자 크기를 적용하고, 닫힌 화면에서 넘어온 안내 메시지를 보여준다. */
open class BaseActivity : AppCompatActivity() {

    // 이 화면을 만들 때 적용한 글자 크기
    private var appliedScale = 0f

    override fun attachBaseContext(newBase: Context) {
        val config = Configuration(newBase.resources.configuration)
        appliedScale = AppSettings.fontSize(newBase).scale
        config.fontScale = appliedScale
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    override fun onResume() {
        super.onResume()
        // 설정에서 글자 크기를 바꾸고 돌아오면, 뒤에 열려 있던 화면도 새 크기로 다시 그린다.
        if (AppSettings.fontSize(this).scale != appliedScale) {
            recreate()
            return
        }
        Msg.showPending(this)
    }

    override fun finish() {
        Msg.handOver(this)
        super.finish()
    }
}