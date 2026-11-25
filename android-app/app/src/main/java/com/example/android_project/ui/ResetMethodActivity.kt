package com.example.android_project.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import com.example.android_project.R

/** 비밀번호 찾기 방법 선택: 아이디와 이메일 / 가입 정보. */
class ResetMethodActivity : BaseActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_reset_method)

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<View>(R.id.cardByEmail).setOnClickListener {
            startActivity(Intent(this, ResetByEmailActivity::class.java))
        }
        findViewById<View>(R.id.cardByInfo).setOnClickListener {
            startActivity(Intent(this, ResetPasswordActivity::class.java))
        }
    }
}