package com.example.android_project.ui

import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.lifecycle.LifecycleCoroutineScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.util.ApiError
import com.example.android_project.util.InputRules
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/**
 * 이메일 인증 화면 조각(view_email_verify.xml)을 다룬다. 가입, 이메일 등록·변경에서 같이 쓴다.
 *  1. 이메일을 입력하고 "인증번호 받기" → 메일로 6자리 인증번호
 *  2. 인증번호 입력 후 "확인" → 서버가 이메일 확인 토큰(emailToken)을 준다
 * 인증을 마친 뒤 이메일을 고치면 인증이 풀린다.
 *
 * @param authToken 로그인한 상태라면 "Bearer ..." (자기 이메일로 다시 인증할 수 있게)
 * @param onMessage 안내 메시지를 보여줄 방법 (스낵바 등)
 */
class EmailVerifier(
    root: View,
    private val scope: LifecycleCoroutineScope,
    private val authToken: String? = null,
    private val onMessage: (String) -> Unit
) {
    private val etEmail: EditText = root.findViewById(R.id.etVerifyEmail)
    private val btnSend: Button = root.findViewById(R.id.btnSendEmailCode)
    private val layoutCode: View = root.findViewById(R.id.layoutEmailCode)
    private val etCode: EditText = root.findViewById(R.id.etEmailCode)
    private val btnVerify: Button = root.findViewById(R.id.btnVerifyEmailCode)
    private val tvStatus: TextView = root.findViewById(R.id.tvEmailVerifyStatus)

    /** 인증을 마친 이메일과 그 확인 토큰. 인증 전이면 null */
    var verifiedEmail: String? = null
        private set
    var emailToken: String? = null
        private set

    private var sentEmail: String? = null
    private val defaultHint = tvStatus.text

    init {
        btnSend.setOnClickListener { send() }
        btnVerify.setOnClickListener { verify() }
        etEmail.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                // 인증번호를 보낸 뒤(또는 인증한 뒤) 이메일을 바꾸면 처음부터 다시 한다.
                // (안내 문구와 인증번호 칸이 이전 주소 것으로 남지 않게)
                val sent = verifiedEmail ?: sentEmail
                if (sent != null && current() != sent) reset()
            }
        })
    }

    fun setEmail(value: String) = etEmail.setText(value)

    fun isVerified(): Boolean = verifiedEmail != null && verifiedEmail == current()

    /** 인증이 안 됐으면 이메일 칸에 안내를 띄우고 false */
    fun requireVerified(): Boolean {
        if (isVerified()) return true
        val email = current()
        etEmail.error = InputRules.emailError(email)
            ?: if (email.isEmpty()) "이메일을 입력해 주세요." else "이메일 인증을 먼저 해 주세요."
        etEmail.requestFocus()
        return false
    }

    private fun current() = etEmail.text.toString().trim().lowercase()

    private fun reset() {
        verifiedEmail = null
        emailToken = null
        sentEmail = null
        layoutCode.visibility = View.GONE
        etCode.text.clear()
        etEmail.isEnabled = true
        btnSend.isEnabled = true
        btnSend.text = "인증번호 받기"
        tvStatus.text = defaultHint
        tvStatus.setTextColor(tvStatus.context.getColor(R.color.rm_sub))
    }

    private fun send() {
        val email = current()
        if (email.isEmpty()) { etEmail.error = "이메일을 입력해 주세요."; return }
        InputRules.emailError(email)?.let { etEmail.error = it; return }

        btnSend.isEnabled = false
        btnSend.text = "보내는 중…"
        scope.launch {
            try {
                val body = JsonObject().apply { addProperty("email", email) }
                // 연결이 끊겨 서버에 닿지 못한 경우의 재시도는 통신 라이브러리(OkHttp)가 알아서 한 번 한다.
                // 여기서 또 보내면, 서버는 받았는데 응답만 늦은 경우 "60초 뒤에 다시"로 거절되어 실패처럼 보인다.
                val response = RetrofitClient.apiService.sendEmailCode(authToken, body)
                val error = if (response.isSuccessful) null else ApiError.parse(response, "인증번호를 보내지 못했어요.")
                if (response.isSuccessful || error?.code == "EMAIL_COOLDOWN") {
                    // 방금 보낸 인증번호가 있으면(60초 안에 다시 누른 경우) 그 번호를 쓰면 된다.
                    sentEmail = email
                    layoutCode.visibility = View.VISIBLE
                    btnSend.text = "다시 받기"
                    tvStatus.text = if (error == null) "$email 로 인증번호를 보냈어요. 10분 안에 입력해 주세요. (스팸함도 확인)"
                    else "$email 로 이미 인증번호를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요. ${error.message}"
                    etCode.requestFocus()
                } else {
                    btnSend.text = if (sentEmail == null) "인증번호 받기" else "다시 받기"
                    onMessage(error?.message ?: "인증번호를 보내지 못했어요.")
                }
            } catch (e: Exception) {
                btnSend.text = if (sentEmail == null) "인증번호 받기" else "다시 받기"
                onMessage("서버에 연결할 수 없어요. 와이파이를 확인하고 다시 눌러 주세요.")
            } finally {
                if (verifiedEmail == null) btnSend.isEnabled = true
            }
        }
    }

    private fun verify() {
        val email = sentEmail ?: return
        val code = etCode.text.toString().trim()
        if (!Regex("^\\d{6}$").matches(code)) { etCode.error = "인증번호 6자리를 입력해 주세요."; return }

        btnVerify.isEnabled = false
        scope.launch {
            try {
                val body = JsonObject().apply { addProperty("email", email); addProperty("code", code) }
                val response = RetrofitClient.apiService.verifyEmailCode(body)
                val token = response.body()?.get("emailToken")?.takeIf { it.isJsonPrimitive }?.asString
                if (response.isSuccessful && token != null) {
                    verifiedEmail = email
                    emailToken = token
                    layoutCode.visibility = View.GONE
                    btnSend.isEnabled = false
                    btnSend.text = "인증 완료"
                    tvStatus.text = "이메일 인증이 끝났어요."
                    tvStatus.setTextColor(tvStatus.context.getColor(R.color.rm_kind_cleaning))
                } else {
                    onMessage(ApiError.messageOf(response, "인증번호를 확인하지 못했어요."))
                }
            } catch (e: Exception) {
                onMessage("서버에 연결할 수 없어요.")
            } finally {
                btnVerify.isEnabled = true
            }
        }
    }
}