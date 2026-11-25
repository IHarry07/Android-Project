package com.example.android_project.ui

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.AuthRepository
import com.example.android_project.model.ResetPasswordRequest
import com.example.android_project.util.ApiError
import com.example.android_project.util.InputRules
import kotlinx.coroutines.launch

/**
 * 비밀번호 찾기 마지막 단계: 새 비밀번호 정하기.
 * 이메일 인증번호 확인(ResetByEmailActivity)을 마치고 받은 확인 토큰이 있어야 열린다. (10분 동안만 쓸 수 있다)
 * 확인 토큰은 이 화면의 메모리에만 두고 저장하지 않는다.
 */
class ResetPasswordActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_RESET_TOKEN = "resetToken"
    }

    private val authRepository = AuthRepository()

    private lateinit var etNewPassword: EditText
    private lateinit var etNewPasswordConfirm: EditText
    private lateinit var btnReset: Button
    private var resetToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        resetToken = intent.getStringExtra(EXTRA_RESET_TOKEN)
        if (resetToken.isNullOrBlank()) {
            // 이메일 인증 없이 이 화면을 열 수는 없다.
            finish()
            return
        }
        setContentView(R.layout.activity_reset_password)

        etNewPassword = findViewById(R.id.etResetNewPassword)
        etNewPasswordConfirm = findViewById(R.id.etResetNewPasswordConfirm)
        btnReset = findViewById(R.id.btnResetPassword)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }
        btnReset.setOnClickListener { reset() }
        etNewPassword.requestFocus()
    }

    private fun reset() {
        val token = resetToken ?: return finish()
        val newPassword = etNewPassword.text.toString()
        val confirm = etNewPasswordConfirm.text.toString()

        InputRules.passwordError(newPassword)?.let { etNewPassword.error = it; return }
        if (newPassword != confirm) { etNewPasswordConfirm.error = "새 비밀번호가 서로 달라요."; return }

        btnReset.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = authRepository.resetPassword(ResetPasswordRequest(token, newPassword))
                if (response.isSuccessful) {
                    toast("비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.")
                    finish()
                    return@launch
                }
                val error = ApiError.parse(response, "비밀번호를 바꾸지 못했어요.")
                when (error.code) {
                    // 이전과 같은 비밀번호: 경고창을 띄우고 새 비밀번호 칸으로 돌아간다. (확인 정보는 그대로 유효하다)
                    "SAME_PASSWORD" -> com.google.android.material.dialog.MaterialAlertDialogBuilder(this@ResetPasswordActivity)
                        .setTitle("이전과 같은 비밀번호예요")
                        .setMessage("지금 쓰던 비밀번호와 같아요.\n다른 비밀번호를 입력해 주세요.")
                        .setPositiveButton("확인") { _, _ ->
                            etNewPassword.text.clear()
                            etNewPasswordConfirm.text.clear()
                            etNewPassword.requestFocus()
                        }
                        .show()
                    // 확인 시간이 지났거나 이미 쓴 확인 정보라면 이메일 인증부터 다시 한다.
                    "RESET_TOKEN_INVALID" -> { toast(error.message); finish() }
                    else -> toast(error.message)
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnReset.isEnabled = true
            }
        }
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}