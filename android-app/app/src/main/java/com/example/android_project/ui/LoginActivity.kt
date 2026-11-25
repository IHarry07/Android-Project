package com.example.android_project.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.method.LinkMovementMethod
import android.text.method.PasswordTransformationMethod
import android.text.style.ClickableSpan
import android.view.View
import androidx.core.content.ContextCompat
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.AuthRepository
import com.example.android_project.model.LoginRequest
import com.example.android_project.ui.main.MainTabsActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.TokenManager
import kotlinx.coroutines.launch

class LoginActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        // 토큰이 만료되어 로그인 화면으로 돌아온 경우 true (AuthInterceptor가 넣어준다)
        const val EXTRA_SESSION_EXPIRED = "session_expired"

        private const val LOCAL_NETWORK_PERMISSION =
            "android.permission.ACCESS_LOCAL_NETWORK"
    }

    private val authRepository = AuthRepository()
    private lateinit var tokenManager: TokenManager

    private lateinit var etLoginId: EditText
    private lateinit var etPassword: EditText
    private lateinit var cbKeepLogin: CheckBox
    private lateinit var btnLogin: Button

    // 실제 폰에서 PC 서버에 접속하려면 Android 17 이상에서 이 권한이 필요하다.
    private val requestLocalNetworkPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                com.example.android_project.util.Msg.makeText(
                    this,
                    "로컬 네트워크 권한이 없으면 실제 기기에서 서버에 접속할 수 없습니다.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager(this)

        // 로그인 유지가 켜져 있으면 로그인 화면을 건너뛰고 바로 메인 화면으로 간다.
        // (토큰이 만료되어 돌아온 경우에는 건너뛰지 않는다.)
        if (savedInstanceState == null &&
            !intent.getBooleanExtra(EXTRA_SESSION_EXPIRED, false) &&
            tokenManager.getToken() != null &&
            tokenManager.isKeepLogin()
        ) {
            startActivity(Intent(this, MainTabsActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_login)

        // 화면 요소 연결
        etLoginId = findViewById(R.id.etLoginId)
        etPassword = findViewById(R.id.etPassword)
        cbKeepLogin = findViewById(R.id.cbKeepLogin)
        btnLogin = findViewById(R.id.btnLogin)
        val tvGoSignup = findViewById<TextView>(R.id.tvGoSignup)

        checkLocalNetworkPermission()

        // 토큰이 만료되어 돌아온 경우에만 안내 팝업을 띄운다.
        if (savedInstanceState == null &&
            intent.getBooleanExtra(EXTRA_SESSION_EXPIRED, false)
        ) {
            com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setMessage("보안상의 이유로 로그인이 해제되었습니다.\n다시 로그인해 주세요.")
                .setPositiveButton("확인", null)
                .show()
        }

        btnLogin.setOnClickListener {
            login()
        }

        // 회원가입 화면 이동
        tvGoSignup.setOnClickListener {
            startActivity(Intent(this, SignupActivity::class.java))
        }

        // 비밀번호 보기/숨기기
        val ivToggle = findViewById<ImageView>(R.id.ivTogglePassword)
        var passwordVisible = false
        ivToggle.setOnClickListener {
            passwordVisible = !passwordVisible
            etPassword.transformationMethod =
                if (passwordVisible) null else PasswordTransformationMethod.getInstance()
            etPassword.setSelection(etPassword.text.length)
            ivToggle.setImageResource(if (passwordVisible) R.drawable.ic_eye else R.drawable.ic_eye_off)
        }

        // 하단 "이용약관 · 개인정보 처리방침": 이용약관은 약관 화면으로, 개인정보 처리방침은 아직 준비 중
        setupLegalLinks(findViewById(R.id.tvLegal))

        // 비밀번호 찾기
        findViewById<TextView>(R.id.tvForgotPassword).setOnClickListener {
            startActivity(Intent(this, ResetByEmailActivity::class.java))
        }
    }

    // 글자의 "이용약관"과 "개인정보 처리방침" 부분만 눌리도록 한다.
    private fun setupLegalLinks(view: TextView) {
        val full = "이용약관  ·  개인정보 처리방침"
        val terms = "이용약관"
        val privacy = "개인정보 처리방침"
        val color = ContextCompat.getColor(this, R.color.rm_title)

        fun link(onClick: () -> Unit) = object : ClickableSpan() {
            override fun onClick(widget: View) = onClick()
            override fun updateDrawState(ds: TextPaint) {
                ds.color = color
                ds.isUnderlineText = true
            }
        }

        val text = SpannableString(full)
        val termsStart = full.indexOf(terms)
        text.setSpan(
            link { startActivity(Intent(this, TermsActivity::class.java)) },
            termsStart, termsStart + terms.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        val privacyStart = full.indexOf(privacy)
        text.setSpan(
            link { startActivity(TermsActivity.privacyIntent(this)) },
            privacyStart, privacyStart + privacy.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )

        view.text = text
        view.movementMethod = LinkMovementMethod.getInstance()
    }

    private fun checkLocalNetworkPermission() {
        if (Build.VERSION.SDK_INT >= 37 &&
            checkSelfPermission(LOCAL_NETWORK_PERMISSION) != PackageManager.PERMISSION_GRANTED
        ) {
            requestLocalNetworkPermission.launch(LOCAL_NETWORK_PERMISSION)
        }
    }

    private fun login() {
        val loginId = etLoginId.text.toString().trim()
        val password = etPassword.text.toString()
        val keepLogin = cbKeepLogin.isChecked

        if (loginId.isEmpty()) {
            etLoginId.error = "아이디를 입력해 주세요."
            return
        }

        if (password.isEmpty()) {
            etPassword.error = "비밀번호를 입력해 주세요."
            return
        }

        // 중복 클릭 방지
        btnLogin.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = authRepository.login(
                    LoginRequest(loginId, password, keepLogin)
                )

                val token = if (response.isSuccessful) {
                    response.body()
                        ?.get("token")
                        ?.takeIf { it.isJsonPrimitive }
                        ?.asString
                } else {
                    null
                }

                if (token != null) {
                    tokenManager.saveToken(token)
                    tokenManager.setKeepLogin(keepLogin)

                    // 로그인 성공 → 메인 화면(아래 메뉴바)으로 이동 (뒤로 가기로 로그인 화면에 돌아오지 않게 종료)
                    startActivity(Intent(this@LoginActivity, MainTabsActivity::class.java))
                    finish()
                } else {
                    val message = if (response.isSuccessful) {
                        "로그인 응답을 확인할 수 없습니다."
                    } else {
                        ApiError.messageOf(response, "로그인에 실패했습니다.")
                    }

                    com.example.android_project.util.Msg.makeText(this@LoginActivity, message, Toast.LENGTH_SHORT).show()
                }

            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(
                    this@LoginActivity,
                    "서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인해 주세요.\n(${e.message})",
                    Toast.LENGTH_LONG
                ).show()

            } finally {
                btnLogin.isEnabled = true
            }
        }
    }
}
