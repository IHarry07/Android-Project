package com.example.android_project.ui

import android.content.Intent
import android.os.Bundle
import android.os.CountDownTimer
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.AuthRepository
import com.example.android_project.util.ApiError
import com.example.android_project.util.InputRules
import com.example.android_project.util.Msg
import kotlinx.coroutines.launch

/**
 * 비밀번호 찾기: 아이디와 이메일 (두 단계)
 *  1단계: 아이디와 이메일을 입력하면 이메일로 인증번호(6자리)를 보낸다.
 *  2단계: 인증번호를 입력하면 확인이 끝나고, 새 비밀번호를 정하는 화면으로 넘어간다.
 * 서버는 아이디나 이메일이 맞는지 알려주지 않는다. (맞든 틀리든 "보냈어요" 안내가 같다.)
 */
class ResetByEmailActivity : BaseActivity() {

    private val authRepository = AuthRepository()

    private lateinit var layoutStep1: View
    private lateinit var layoutStep2: View
    private lateinit var etLoginId: EditText
    private lateinit var etEmail: EditText
    private lateinit var etCode: EditText
    private lateinit var btnSend: Button
    private lateinit var btnVerify: Button
    private lateinit var tvResend: TextView
    private lateinit var tvGuide: TextView

    private var sentLoginId = ""
    private var timer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_reset_email)

        layoutStep1 = findViewById(R.id.layoutEmailStep1)
        layoutStep2 = findViewById(R.id.layoutEmailStep2)
        etLoginId = findViewById(R.id.etEmailLoginId)
        etEmail = findViewById(R.id.etEmailAddress)
        etCode = findViewById(R.id.etCode)
        btnSend = findViewById(R.id.btnSendCode)
        btnVerify = findViewById(R.id.btnVerifyCode)
        tvResend = findViewById(R.id.tvResend)
        tvGuide = findViewById(R.id.tvCodeGuide)

        findViewById<View>(R.id.ivBack).setOnClickListener { goBack() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })

        btnSend.setOnClickListener { sendCode(first = true) }
        tvResend.setOnClickListener { sendCode(first = false) }
        btnVerify.setOnClickListener { verifyCode() }
    }

    override fun onDestroy() {
        timer?.cancel()
        super.onDestroy()
    }

    // 2단계에서 뒤로 가면 1단계로, 1단계에서 뒤로 가면 방법 선택 화면으로 돌아간다.
    private fun goBack() {
        if (layoutStep2.visibility == View.VISIBLE) {
            timer?.cancel()
            etCode.text.clear()
            layoutStep2.visibility = View.GONE
            layoutStep1.visibility = View.VISIBLE
        } else {
            finish()
        }
    }

    // ---- 1단계: 인증번호 보내기 ----

    private fun sendCode(first: Boolean) {
        val loginId = if (first) etLoginId.text.toString().trim() else sentLoginId
        val email = etEmail.text.toString().trim().lowercase()

        if (loginId.isEmpty()) { etLoginId.error = "아이디를 입력해 주세요."; return }
        if (email.isEmpty()) { etEmail.error = "이메일을 입력해 주세요."; return }
        InputRules.emailError(email)?.let { etEmail.error = it; return }

        btnSend.isEnabled = false
        tvResend.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.sendResetCode(loginId, email)
                if (response.isSuccessful) {
                    sentLoginId = loginId
                    tvGuide.text = "입력한 정보가 가입 정보와 같다면 ${email}로 인증번호를 보냈어요."
                    layoutStep1.visibility = View.GONE
                    layoutStep2.visibility = View.VISIBLE
                    etCode.requestFocus()
                    startCooldown()
                    if (!first) Msg.show(this@ResetByEmailActivity, "인증번호를 다시 보냈어요.")
                } else {
                    // 준비 중(메일 설정 없음), 너무 많이 요청함 등의 안내를 그대로 보여준다.
                    Msg.show(this@ResetByEmailActivity, ApiError.messageOf(response, "인증번호를 보내지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@ResetByEmailActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnSend.isEnabled = true
                if (layoutStep2.visibility != View.VISIBLE || timer == null) tvResend.isEnabled = true
            }
        }
    }

    // 다시 받기는 60초 뒤에 눌 수 있다. (서버도 60초에 한 번만 보낸다.)
    private fun startCooldown() {
        timer?.cancel()
        tvResend.isEnabled = false
        timer = object : CountDownTimer(60_000, 1_000) {
            override fun onTick(millisUntilFinished: Long) {
                tvResend.text = "인증번호 다시 받기 (${millisUntilFinished / 1000}초)"
            }

            override fun onFinish() {
                tvResend.text = "인증번호 다시 받기"
                tvResend.isEnabled = true
            }
        }.also { it.start() }
    }

    // ---- 2단계: 인증번호 확인 ----

    private fun verifyCode() {
        val code = etCode.text.toString().trim()
        if (!Regex("^\\d{6}$").matches(code)) {
            etCode.error = "인증번호 6자리를 입력해 주세요."
            return
        }

        btnVerify.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = authRepository.verifyResetCode(sentLoginId, code)
                if (response.isSuccessful) {
                    val token = response.body()?.get("resetToken")?.takeIf { it.isJsonPrimitive }?.asString
                    if (token.isNullOrBlank()) {
                        Msg.show(this@ResetByEmailActivity, "확인 정보를 받지 못했어요. 다시 시도해 주세요.")
                    } else {
                        // 확인 완료: 새 비밀번호를 정하는 화면으로 넘어가고, 이 화면은 닫는다.
                        startActivity(
                            Intent(this@ResetByEmailActivity, ResetPasswordActivity::class.java)
                                .putExtra(ResetPasswordActivity.EXTRA_RESET_TOKEN, token)
                        )
                        finish()
                    }
                } else {
                    Msg.show(this@ResetByEmailActivity, ApiError.messageOf(response, "인증번호를 확인하지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@ResetByEmailActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnVerify.isEnabled = true
            }
        }
    }
}