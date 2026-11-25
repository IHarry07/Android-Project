package com.example.android_project.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.UserRepository
import com.example.android_project.model.UpdateMeRequest
import com.example.android_project.ui.main.MainTabsActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.Session
import com.example.android_project.util.TokenManager
import kotlinx.coroutines.launch

/**
 * 이메일 등록·변경 (인증번호로 확인)
 *  - REQUIRED: 이메일이 없는 회원이 로그인하면 먼저 이 화면이 나온다. 등록해야 앱을 쓸 수 있다. (로그아웃은 가능)
 *  - CHANGE  : [내 정보]에서 이메일을 바꿀 때. 바꾸면 이전 주소로 알림 메일이 간다.
 */
class EmailVerifyActivity : BaseActivity() {

    companion object {
        const val EXTRA_MODE = "mode"
        const val MODE_REQUIRED = "REQUIRED"
        const val MODE_CHANGE = "CHANGE"
        const val EXTRA_CURRENT_EMAIL = "currentEmail"
    }

    private lateinit var verifier: EmailVerifier
    private lateinit var btnSave: Button
    private var required = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_email_verify)

        required = intent.getStringExtra(EXTRA_MODE) != MODE_CHANGE
        val auth = TokenManager(this).getToken()?.let { "Bearer $it" }
        verifier = EmailVerifier(findViewById(R.id.emailVerify), lifecycleScope, auth) { Msg.show(this, it, true) }
        btnSave = findViewById(R.id.btnSaveEmail)

        if (!required) {
            findViewById<TextView>(R.id.tvEmailScreenTitle).text = "이메일 변경"
            findViewById<TextView>(R.id.tvEmailHeadline).text = "새 이메일을 인증해 주세요"
            val current = intent.getStringExtra(EXTRA_CURRENT_EMAIL).orEmpty()
            findViewById<TextView>(R.id.tvEmailGuide).text =
                (if (current.isNotEmpty()) "지금 이메일: $current\n" else "") +
                    "바꾸면 이전 이메일로 변경 알림이 가요. 앞으로 비밀번호 찾기 메일은 새 주소로 가요."
            btnSave.text = "변경하기"
            findViewById<View>(R.id.tvEmailLogout).visibility = View.GONE
        }

        findViewById<View>(R.id.ivBack).setOnClickListener { goBack() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })
        findViewById<View>(R.id.tvEmailLogout).setOnClickListener { Session.logout(this) }
        btnSave.setOnClickListener { save() }
    }

    // 등록이 꼭 필요한 경우에는 뒤로 가도 앱을 쓰지 못하고 앱을 닫는다.
    private fun goBack() {
        if (required) moveTaskToBack(true) else finish()
    }

    private fun save() {
        if (!verifier.requireVerified()) return
        val email = verifier.verifiedEmail ?: return
        val token = verifier.emailToken ?: return

        btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = UserRepository(this@EmailVerifyActivity).updateMe(UpdateMeRequest(email = email, emailToken = token))
                when {
                    response == null -> Msg.show(this@EmailVerifyActivity, "로그인이 필요합니다.")
                    response.isSuccessful -> {
                        if (required) {
                            Msg.showOnNextScreen("이메일을 등록했어요.")
                            startActivity(
                                Intent(this@EmailVerifyActivity, MainTabsActivity::class.java)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                            )
                        } else {
                            Msg.show(this@EmailVerifyActivity, "이메일을 바꿨어요.")
                            finish()
                        }
                    }
                    else -> Msg.show(this@EmailVerifyActivity, ApiError.messageOf(response, "저장하지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@EmailVerifyActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnSave.isEnabled = true
            }
        }
    }
}