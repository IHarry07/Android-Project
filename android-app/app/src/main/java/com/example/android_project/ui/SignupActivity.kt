package com.example.android_project.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.AuthRepository
import com.example.android_project.model.SignupRequest
import com.example.android_project.util.ApiError
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeParseException

class SignupActivity : com.example.android_project.ui.BaseActivity() {

    private val authRepository = AuthRepository()

    private lateinit var etLoginId: EditText
    private lateinit var etPassword: EditText
    private lateinit var etName: EditText
    private lateinit var etNickname: EditText
    private lateinit var etPhone: EditText
    private lateinit var emailVerifier: EmailVerifier
    private lateinit var etAccount: EditText
    private lateinit var etBirthDate: EditText
    private lateinit var rgGender: RadioGroup

    private lateinit var btnCheckLoginId: Button
    private lateinit var btnCheckNickname: Button
    private lateinit var btnSignup: Button
    private lateinit var cbAgreeAll: android.widget.CheckBox
    private lateinit var cbAgreeTerms: android.widget.CheckBox
    private lateinit var cbAgreePrivacy: android.widget.CheckBox

    // 약관을 끝까지 읽었는지. 읽어야 체크할 수 있다.
    private var readTerms = false
    private var readPrivacy = false

    private val termsLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) {
        if (it.resultCode == android.app.Activity.RESULT_OK) {
            readTerms = true
            cbAgreeTerms.isChecked = true
            syncAll()
        }
    }
    private val privacyLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) {
        if (it.resultCode == android.app.Activity.RESULT_OK) {
            readPrivacy = true
            cbAgreePrivacy.isChecked = true
            syncAll()
        }
    }

    private fun openTerms() = termsLauncher.launch(
        Intent(this, TermsActivity::class.java).putExtra(TermsActivity.EXTRA_REQUIRE_READ, true)
    )

    private fun openPrivacy() = privacyLauncher.launch(
        TermsActivity.privacyIntent(this).putExtra(TermsActivity.EXTRA_REQUIRE_READ, true)
    )

    // 둘 다 체크되어 있을 때만 "전체 동의"가 체크된다.
    private fun syncAll() {
        cbAgreeAll.isChecked = cbAgreeTerms.isChecked && cbAgreePrivacy.isChecked
    }

    private fun askToRead(what: String, open: () -> Unit) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("끝까지 읽어 주세요")
            .setMessage("$what 끝까지 읽어야 동의할 수 있어요.\n문서를 열어 맨 아래까지 내려 주세요.")
            .setNegativeButton("닫기", null)
            .setPositiveButton("읽어보기") { _, _ -> open() }
            .show()
    }

    // 중복 확인을 통과한 값. 입력칸이 바뀌면 다시 확인해야 한다.
    private var verifiedLoginId: String? = null
    private var verifiedNickname: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_signup)

        etLoginId = findViewById(R.id.etSignupLoginId)
        etPassword = findViewById(R.id.etSignupPassword)
        etName = findViewById(R.id.etSignupName)
        etNickname = findViewById(R.id.etSignupNickname)
        etPhone = findViewById(R.id.etSignupPhone)
        emailVerifier = EmailVerifier(findViewById(R.id.emailVerify), lifecycleScope) { toast(it) }
        etAccount = findViewById(R.id.etSignupAccount)
        etBirthDate = findViewById(R.id.etSignupBirthDate)
        rgGender = findViewById(R.id.rgGender)

        btnCheckLoginId = findViewById(R.id.btnCheckLoginId)
        btnCheckNickname = findViewById(R.id.btnCheckNickname)
        btnSignup = findViewById(R.id.btnSignup)

        btnCheckLoginId.setOnClickListener { checkLoginId() }
        btnCheckNickname.setOnClickListener { checkNickname() }
        btnSignup.setOnClickListener { signup() }

        // 약관 동의: 문서를 끝까지 읽은 뒤에만 체크할 수 있다. (읽지 않고 체크하면 읽어야 한다는 팝업이 뜬다.)
        cbAgreeAll = findViewById(R.id.cbAgreeAll)
        cbAgreeTerms = findViewById(R.id.cbAgreeTerms)
        cbAgreePrivacy = findViewById(R.id.cbAgreePrivacy)

        cbAgreeTerms.setOnClickListener {
            if (cbAgreeTerms.isChecked && !readTerms) {
                cbAgreeTerms.isChecked = false
                askToRead("이용약관을") { openTerms() }
            }
            syncAll()
        }
        cbAgreePrivacy.setOnClickListener {
            if (cbAgreePrivacy.isChecked && !readPrivacy) {
                cbAgreePrivacy.isChecked = false
                askToRead("개인정보 처리방침을") { openPrivacy() }
            }
            syncAll()
        }
        cbAgreeAll.setOnClickListener {
            if (!cbAgreeAll.isChecked) {
                // 전체 동의를 풀면 둘 다 푼다.
                cbAgreeTerms.isChecked = false
                cbAgreePrivacy.isChecked = false
            } else if (readTerms && readPrivacy) {
                cbAgreeTerms.isChecked = true
                cbAgreePrivacy.isChecked = true
            } else {
                cbAgreeAll.isChecked = false
                val what = when {
                    !readTerms && !readPrivacy -> "이용약관과 개인정보 처리방침을"
                    !readTerms -> "이용약관을"
                    else -> "개인정보 처리방침을"
                }
                askToRead(what) { if (!readTerms) openTerms() else openPrivacy() }
            }
        }
        findViewById<View>(R.id.tvViewTerms).setOnClickListener { openTerms() }
        findViewById<View>(R.id.tvViewPrivacy).setOnClickListener { openPrivacy() }
    }

    // ---------------------------------------------------------------
    // 입력 검사 (서버 규칙과 같다. backend/src/utils/schemas.js 참고)
    // 서버도 다시 검사하므로, 여기서는 불필요한 요청을 줄이는 것이 목적이다.
    // ---------------------------------------------------------------

    private fun loginIdError(v: String): String? =
        if (!Regex("^[a-z0-9_]{4,20}$").matches(v)) {
            "아이디는 영문 소문자, 숫자, 밑줄(_)로 4~20자여야 합니다."
        } else null

    private fun passwordError(v: String): String? = when {
        v.length < 8 -> "비밀번호는 8자 이상이어야 합니다."
        v.toByteArray(Charsets.UTF_8).size > 72 -> "비밀번호가 너무 깁니다."
        !v.any { it in 'A'..'Z' || it in 'a'..'z' } || !v.any { it.isDigit() } ->
            "비밀번호에는 영문자와 숫자가 모두 들어가야 합니다."
        else -> null
    }

    private fun nameError(v: String): String? =
        if (v.isEmpty() || v.length > 50) "이름은 1~50자로 입력해 주세요." else null

    private fun nicknameError(v: String): String? =
        if (!Regex("^[가-힣a-zA-Z0-9_]{2,20}$").matches(v)) {
            "닉네임은 한글, 영문, 숫자, 밑줄(_)로 2~20자여야 합니다."
        } else null

    private fun phoneError(v: String): String? {
        val digits = v.filter { it.isDigit() }
        return if (!Regex("^01[016789]\\d{7,8}$").matches(digits)) {
            "전화번호 형식이 올바르지 않습니다. 예: 010-1234-5678"
        } else null
    }

    private fun accountError(v: String): String? = when {
        v.length < 5 || v.length > 100 -> "계좌 정보는 5~100자로 입력해 주세요."
        !Regex("\\d{4,}").containsMatchIn(v.replace("-", "").replace(" ", "")) ->
            "계좌번호(숫자)가 포함되어야 합니다."
        else -> null
    }

    private fun birthDateError(v: String): String? {
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(v)) {
            return "생년월일은 YYYY-MM-DD 형식이어야 합니다."
        }

        return try {
            val date = LocalDate.parse(v)
            when {
                date.isBefore(LocalDate.of(1900, 1, 1)) || date.isAfter(LocalDate.now()) -> "생년월일이 올바르지 않습니다."
                // 약관: 만 14세 미만은 가입할 수 없다. (생일이 지났는지까지 따진다)
                date.plusYears(14).isAfter(LocalDate.now()) -> "만 14세 미만은 가입할 수 없어요."
                else -> null
            }
        } catch (e: DateTimeParseException) {
            "존재하지 않는 날짜입니다."
        }
    }

    // ---------------------------------------------------------------
    // 중복 확인
    // ---------------------------------------------------------------

    private fun checkLoginId() {
        val loginId = etLoginId.text.toString().trim()

        loginIdError(loginId)?.let {
            etLoginId.error = it
            return
        }

        btnCheckLoginId.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.checkLoginId(loginId)

                if (!response.isSuccessful) {
                    toast(ApiError.messageOf(response, "아이디 확인에 실패했습니다."))
                    return@launch
                }

                val available = response.body()?.get("available")?.asBoolean ?: false

                if (available) {
                    verifiedLoginId = loginId
                    toast("사용할 수 있는 아이디입니다.")
                } else {
                    verifiedLoginId = null
                    etLoginId.error = "이미 사용 중인 아이디입니다."
                }

            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnCheckLoginId.isEnabled = true
            }
        }
    }

    private fun checkNickname() {
        val nickname = etNickname.text.toString().trim()

        nicknameError(nickname)?.let {
            etNickname.error = it
            return
        }

        btnCheckNickname.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.checkNickname(nickname)

                if (!response.isSuccessful) {
                    toast(ApiError.messageOf(response, "닉네임 확인에 실패했습니다."))
                    return@launch
                }

                val available = response.body()?.get("available")?.asBoolean ?: false

                if (available) {
                    verifiedNickname = nickname
                    toast("사용할 수 있는 닉네임입니다.")
                } else {
                    verifiedNickname = null
                    etNickname.error = "이미 사용 중인 닉네임입니다."
                }

            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnCheckNickname.isEnabled = true
            }
        }
    }

    // ---------------------------------------------------------------
    // 회원가입
    // ---------------------------------------------------------------

    private fun signup() {
        val loginId = etLoginId.text.toString().trim()
        val password = etPassword.text.toString()
        val name = etName.text.toString().trim()
        val nickname = etNickname.text.toString().trim()
        val phone = etPhone.text.toString().trim()
        val account = etAccount.text.toString().trim()
        val birthDate = etBirthDate.text.toString().trim()

        // 위에서부터 첫 번째 오류에서 멈추고 해당 칸에 표시한다.
        loginIdError(loginId)?.let { etLoginId.error = it; return }
        passwordError(password)?.let { etPassword.error = it; return }
        nameError(name)?.let { etName.error = it; return }
        nicknameError(nickname)?.let { etNickname.error = it; return }
        phoneError(phone)?.let { etPhone.error = it; return }
        // 이메일은 필수이고, 인증번호 확인까지 끝나야 가입할 수 있다.
        if (!emailVerifier.requireVerified()) return
        val email = emailVerifier.verifiedEmail ?: return
        val emailToken = emailVerifier.emailToken ?: return
        accountError(account)?.let { etAccount.error = it; return }
        birthDateError(birthDate)?.let { etBirthDate.error = it; return }

        val gender = when (rgGender.checkedRadioButtonId) {
            R.id.rbMale -> "MALE"
            R.id.rbFemale -> "FEMALE"
            R.id.rbOther -> "OTHER"
            else -> {
                toast("성별을 선택해 주세요.")
                return
            }
        }

        if (verifiedLoginId != loginId) {
            etLoginId.error = "아이디 중복확인을 해주세요."
            return
        }

        if (verifiedNickname != nickname) {
            etNickname.error = "닉네임 중복확인을 해주세요."
            return
        }

        if (!cbAgreeTerms.isChecked) {
            toast("이용약관에 동의해 주세요.")
            return
        }
        if (!cbAgreePrivacy.isChecked) {
            toast("개인정보 수집·이용에 동의해 주세요.")
            return
        }

        // 중복 클릭 방지
        btnSignup.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.signup(
                    SignupRequest(
                        loginId = loginId,
                        password = password,
                        name = name,
                        nickname = nickname,
                        phone = phone,
                        email = email,
                        emailToken = emailToken,
                        accountInfo = account,
                        birthDate = birthDate,
                        gender = gender,
                        agreeTerms = cbAgreeTerms.isChecked,
                        agreePrivacy = cbAgreePrivacy.isChecked
                    )
                )

                if (response.isSuccessful) {
                    toast("회원가입이 완료되었습니다. 로그인해 주세요.")
                    finish()
                } else {
                    toast(ApiError.messageOf(response, "회원가입에 실패했습니다."))
                }

            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnSignup.isEnabled = true
            }
        }
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
