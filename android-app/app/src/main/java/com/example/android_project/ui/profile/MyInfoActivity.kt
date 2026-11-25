package com.example.android_project.ui.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.UserRepository
import com.example.android_project.model.UpdateMeRequest
import com.example.android_project.model.User
import com.example.android_project.util.ApiError
import com.example.android_project.util.InputRules
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import kotlinx.coroutines.launch

// 내 정보: 이름·닉네임·전화번호 수정, 계좌 변경, 비밀번호 변경
class MyInfoActivity : com.example.android_project.ui.BaseActivity() {

    private lateinit var repo: UserRepository

    private lateinit var tvLoginId: TextView
    private lateinit var etName: EditText
    private lateinit var etNickname: EditText
    private lateinit var etPhone: EditText
    private lateinit var tvEmail: TextView
    private lateinit var tvBirthGender: TextView
    private lateinit var tvAccount: TextView
    private lateinit var btnSave: Button

    // 서버에서 불러온 값. 바뀐 항목만 서버에 보낸다.
    private var user: User? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_my_info)

        repo = UserRepository(this)

        tvLoginId = findViewById(R.id.tvLoginId)
        etName = findViewById(R.id.etMyName)
        etNickname = findViewById(R.id.etMyNickname)
        etPhone = findViewById(R.id.etMyPhone)
        tvEmail = findViewById(R.id.tvMyEmail)
        // 이메일은 새 이메일로 인증을 해야 바꿀 수 있어서 따로 화면을 연다.
        findViewById<Button>(R.id.btnChangeEmail).setOnClickListener {
            startActivity(
                android.content.Intent(this, com.example.android_project.ui.EmailVerifyActivity::class.java)
                    .putExtra(com.example.android_project.ui.EmailVerifyActivity.EXTRA_MODE, com.example.android_project.ui.EmailVerifyActivity.MODE_CHANGE)
                    .putExtra(com.example.android_project.ui.EmailVerifyActivity.EXTRA_CURRENT_EMAIL, user?.email.orEmpty())
            )
        }
        tvBirthGender = findViewById(R.id.tvBirthGender)
        tvAccount = findViewById(R.id.tvAccount)
        btnSave = findViewById(R.id.btnSaveMyInfo)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }
        btnSave.setOnClickListener { save() }
        findViewById<Button>(R.id.btnChangePassword).setOnClickListener { showPasswordDialog() }
        findViewById<Button>(R.id.btnChangeAccount).setOnClickListener { showAccountDialog() }

        load()
    }

    // 이메일 변경 화면에서 돌아오면 바뀐 이메일이 보이도록 다시 불러온다.
    override fun onResume() {
        super.onResume()
        if (user != null) load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val response = repo.getMe()

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val json = response.body()?.getAsJsonObject("user") ?: return@launch
                        show(Gson().fromJson(json, User::class.java))
                    }
                    else -> toast(ApiError.messageOf(response, "내 정보를 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    private fun show(u: User) {
        user = u
        tvLoginId.text = u.loginId
        etName.setText(u.name)
        etNickname.setText(u.nickname)
        etPhone.setText(u.phone)
        tvEmail.text = u.email ?: "등록된 이메일이 없어요"
        tvBirthGender.text = "${u.birthDate?.take(10) ?: "-"}  ·  ${u.genderText()}"
        tvAccount.text = u.accountMasked ?: "-"
    }

    // 바뀐 항목만 보낸다. 닉네임·전화번호가 이미 쓰이고 있으면 서버가 안내한다.
    private fun save() {
        val current = user ?: return

        val name = etName.text.toString().trim()
        val nickname = etNickname.text.toString().trim()
        val phone = etPhone.text.toString().trim()

        InputRules.nameError(name)?.let { etName.error = it; return }
        InputRules.nicknameError(nickname)?.let { etNickname.error = it; return }
        InputRules.phoneError(phone)?.let { etPhone.error = it; return }


        // 전화번호는 숫자만 비교한다. (010-1234-5678 과 01012345678 은 같은 번호)
        val phoneChanged = phone.filter { it.isDigit() } != current.phone.filter { it.isDigit() }

        val request = UpdateMeRequest(
            name = name.takeIf { it != current.name },
            nickname = nickname.takeIf { it != current.nickname },
            phone = phone.takeIf { phoneChanged }
        )

        if (request.name == null && request.nickname == null && request.phone == null) {
            toast("바뀐 내용이 없어요.")
            return
        }

        btnSave.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = repo.updateMe(request)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val json = response.body()?.getAsJsonObject("user")
                        if (json != null) show(Gson().fromJson(json, User::class.java))
                        toast("저장했어요.")
                    }
                    else -> toast(ApiError.messageOf(response, "저장하지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnSave.isEnabled = true
            }
        }
    }

    // ---- 비밀번호 변경 ----

    private fun showPasswordDialog() {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_change_password, null)
        val etCurrent = view.findViewById<EditText>(R.id.etCurrentPassword)
        val etNew = view.findViewById<EditText>(R.id.etNewPassword)
        val etConfirm = view.findViewById<EditText>(R.id.etNewPasswordConfirm)

        val dialog = com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("비밀번호 변경")
            .setView(view)
            .setPositiveButton("변경", null)
            .setNegativeButton("취소", null)
            .create()
        dialog.show()

        // 입력이 틀렸을 때 창이 닫히지 않도록 직접 클릭 처리
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val current = etCurrent.text.toString()
            val new = etNew.text.toString()
            val confirm = etConfirm.text.toString()

            when {
                current.isEmpty() -> etCurrent.error = "현재 비밀번호를 입력해 주세요."
                InputRules.passwordError(new) != null -> etNew.error = InputRules.passwordError(new)
                new != confirm -> etConfirm.error = "새 비밀번호가 서로 달라요."
                else -> changePassword(dialog, current, new)
            }
        }
    }

    private fun changePassword(dialog: AlertDialog, current: String, new: String) {
        lifecycleScope.launch {
            try {
                val response = repo.changePassword(current, new)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        // 이전 토큰이 모두 무효가 되므로, 새로 받은 토큰을 저장해야 계속 쓸 수 있다.
                        response.body()?.get("token")?.takeIf { it.isJsonPrimitive }?.asString
                            ?.let { TokenManager(this@MyInfoActivity).saveToken(it) }
                        dialog.dismiss()
                        toast("비밀번호를 바꿨어요. 다른 기기의 로그인은 해제돼요.")
                    }
                    ApiError.parse(response).code == "SAME_PASSWORD" ->
                        // 열려 있는 비밀번호 변경 창 위에 경고창을 띄운다.
                        com.google.android.material.dialog.MaterialAlertDialogBuilder(this@MyInfoActivity)
                            .setTitle("이전과 같은 비밀번호예요")
                            .setMessage("지금 쓰는 비밀번호와 같아요.\n다른 비밀번호를 입력해 주세요.")
                            .setPositiveButton("확인", null)
                            .show()
                    else -> toast(ApiError.messageOf(response, "비밀번호를 바꾸지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    // ---- 계좌 변경 ----

    private fun showAccountDialog() {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_change_account, null)
        val etPassword = view.findViewById<EditText>(R.id.etAccountPassword)
        val etAccount = view.findViewById<EditText>(R.id.etNewAccount)

        val dialog = com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("계좌 변경")
            .setView(view)
            .setPositiveButton("변경", null)
            .setNegativeButton("취소", null)
            .create()
        dialog.show()

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val password = etPassword.text.toString()
            val account = etAccount.text.toString().trim()

            when {
                password.isEmpty() -> etPassword.error = "현재 비밀번호를 입력해 주세요."
                InputRules.accountError(account) != null -> etAccount.error = InputRules.accountError(account)
                else -> changeAccount(dialog, password, account)
            }
        }
    }

    private fun changeAccount(dialog: AlertDialog, password: String, account: String) {
        lifecycleScope.launch {
            try {
                val response = repo.changeAccount(password, account)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        dialog.dismiss()
                        toast("계좌 정보를 바꿨어요.")
                        load()
                    }
                    else -> toast(ApiError.messageOf(response, "계좌를 바꾸지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
