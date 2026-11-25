package com.example.android_project.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.AuthRepository
import com.example.android_project.model.ResetPasswordRequest
import com.example.android_project.model.VerifyIdentityRequest
import com.example.android_project.util.ApiError
import com.example.android_project.util.InputRules
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * 비밀번호 찾기 (두 단계)
 *  1단계: 가입 정보(아이디, 이름, 전화번호, 생년월일)를 확인한다. 맞으면 서버가 확인 토큰을 준다.
 *  2단계: 확인이 끝나면 화면이 넘어가고, 새 비밀번호를 정한다. (확인 토큰은 10분 동안만 쓸 수 있다.)
 * 확인 토큰은 이 화면의 메모리에만 두고 저장하지 않는다.
 */
class ResetPasswordActivity : com.example.android_project.ui.BaseActivity() {

    private val authRepository = AuthRepository()

    private lateinit var layoutStep1: View
    private lateinit var layoutStep2: View

    private lateinit var etLoginId: EditText
    private lateinit var etName: EditText
    private lateinit var etPhone: EditText
    private lateinit var etBirthDate: EditText
    private lateinit var btnVerify: Button

    private lateinit var etNewPassword: EditText
    private lateinit var etNewPasswordConfirm: EditText
    private lateinit var btnReset: Button

    // 1단계를 통과했을 때만 값이 있다.
    private var resetToken: String? = null

    // 이메일 인증으로 이미 확인을 마치고 넘어온 경우(바로 새 비밀번호 단계)
    private var cameWithToken = false

    companion object {
        const val EXTRA_RESET_TOKEN = "resetToken"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_reset_password)

        layoutStep1 = findViewById(R.id.layoutStep1)
        layoutStep2 = findViewById(R.id.layoutStep2)

        etLoginId = findViewById(R.id.etResetLoginId)
        etName = findViewById(R.id.etResetName)
        etPhone = findViewById(R.id.etResetPhone)
        etBirthDate = findViewById(R.id.etResetBirthDate)
        btnVerify = findViewById(R.id.btnVerify)

        etNewPassword = findViewById(R.id.etResetNewPassword)
        etNewPasswordConfirm = findViewById(R.id.etResetNewPasswordConfirm)
        btnReset = findViewById(R.id.btnResetPassword)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { goBack() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })

        btnVerify.setOnClickListener { verify() }
        btnReset.setOnClickListener { reset() }

        // 이메일 인증을 마치고 왔다면 가입 정보 확인 단계를 건너뛰고 바로 새 비밀번호를 정한다.
        intent.getStringExtra(EXTRA_RESET_TOKEN)?.let {
            cameWithToken = true
            showStep2(it)
        }
    }

    // 2단계에서 뒤로 가면 1단계로, 1단계에서 뒤로 가면 로그인 화면으로 돌아간다.
    private fun goBack() {
        if (resetToken != null && !cameWithToken) {
            showStep1()
        } else {
            finish()
        }
    }

    private fun showStep1() {
        resetToken = null
        etNewPassword.text.clear()
        etNewPasswordConfirm.text.clear()
        layoutStep2.visibility = View.GONE
        layoutStep1.visibility = View.VISIBLE
    }

    private fun showStep2(token: String) {
        resetToken = token
        layoutStep1.visibility = View.GONE
        layoutStep2.visibility = View.VISIBLE
        etNewPassword.requestFocus()
    }

    // 생년월일 형식 검사 (서버 규칙과 같다)
    private fun birthDateError(v: String): String? {
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(v)) {
            return "생년월일은 YYYY-MM-DD 형식이어야 합니다."
        }
        return try {
            val date = LocalDate.parse(v)
            if (date.isBefore(LocalDate.of(1900, 1, 1)) || date.isAfter(LocalDate.now())) {
                "생년월일이 올바르지 않습니다."
            } else null
        } catch (e: DateTimeParseException) {
            "존재하지 않는 날짜입니다."
        }
    }

    // ---- 1단계: 가입 정보 확인 ----

    private fun verify() {
        val loginId = etLoginId.text.toString().trim()
        val name = etName.text.toString().trim()
        val phone = etPhone.text.toString().trim()
        val birthDate = etBirthDate.text.toString().trim()

        if (loginId.isEmpty()) { etLoginId.error = "아이디를 입력해 주세요."; return }
        InputRules.nameError(name)?.let { etName.error = it; return }
        InputRules.phoneError(phone)?.let { etPhone.error = it; return }
        birthDateError(birthDate)?.let { etBirthDate.error = it; return }

        btnVerify.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.verifyIdentity(
                    VerifyIdentityRequest(loginId, name, phone, birthDate)
                )

                if (response.isSuccessful) {
                    val token = response.body()
                        ?.get("resetToken")
                        ?.takeIf { it.isJsonPrimitive }
                        ?.asString

                    if (token.isNullOrBlank()) {
                        toast("확인 정보를 받지 못했어요. 다시 시도해 주세요.")
                    } else {
                        // 확인 완료: 새 비밀번호를 정하는 화면으로 넘어간다.
                        showStep2(token)
                    }
                } else {
                    // 어느 항목이 틀렸는지는 서버도 알려주지 않는다.
                    toast(ApiError.messageOf(response, "가입 정보를 확인하지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnVerify.isEnabled = true
            }
        }
    }

    // ---- 2단계: 새 비밀번호 ----

    private fun reset() {
        val token = resetToken
        if (token == null) {
            showStep1()
            return
        }

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
                    // 로그인 화면으로 돌아간다.
                    finish()
                } else {
                    val error = ApiError.parse(response, "비밀번호를 바꾸지 못했어요.")
                    if (error.code == "SAME_PASSWORD") {
                        // 이전과 같은 비밀번호: 경고창을 띄우고 새 비밀번호 칸으로 돌아간다. (확인 정보는 그대로 유효하다.)
                        com.google.android.material.dialog.MaterialAlertDialogBuilder(this@ResetPasswordActivity)
                            .setTitle("이전과 같은 비밀번호예요")
                            .setMessage("지금 쓰던 비밀번호와 같아요.\n다른 비밀번호를 입력해 주세요.")
                            .setPositiveButton("확인") { _, _ ->
                                etNewPassword.text.clear()
                                etNewPasswordConfirm.text.clear()
                                etNewPassword.requestFocus()
                            }
                            .show()
                        return@launch
                    }
                    toast(error.message)

                    // 확인 시간이 지났거나 이미 쓴 확인 정보라면 1단계부터 다시 한다.
                    if (error.code == "RESET_TOKEN_INVALID") {
                        if (cameWithToken) finish() else showStep1()
                    }
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
