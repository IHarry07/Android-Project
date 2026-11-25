package com.example.android_project.ui.settings

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.data.UserRepository
import com.example.android_project.ui.BaseActivity
import com.example.android_project.ui.LoginActivity
import com.example.android_project.ui.expense.ExpenseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

/**
 * 회원 탈퇴 (약관 제13·14조). 비밀번호를 다시 확인하고, 방에 속해 있다면 방 나가기와 같은 규칙으로 처리한다.
 * 정산이 남았거나 방장 위임이 필요하면 서버가 막고, 그 이유를 안내한다.
 */
class WithdrawActivity : BaseActivity() {

    private lateinit var repo: UserRepository
    private lateinit var etPassword: EditText
    private lateinit var btnWithdraw: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_withdraw)
        repo = UserRepository(this)

        etPassword = findViewById(R.id.etWithdrawPassword)
        btnWithdraw = findViewById(R.id.btnWithdraw)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }

        btnWithdraw.setOnClickListener {
            if (etPassword.text.toString().isEmpty()) {
                etPassword.error = "비밀번호를 입력해 주세요."
                return@setOnClickListener
            }
            if (!findViewById<CheckBox>(R.id.cbWithdrawConfirm).isChecked) {
                Msg.show(this, "안내 내용을 확인했다고 체크해 주세요.")
                return@setOnClickListener
            }
            MaterialAlertDialogBuilder(this)
                .setTitle("회원 탈퇴")
                .setMessage("탈퇴하면 되돌릴 수 없어요. 정말 탈퇴할까요?")
                .setNegativeButton("취소", null)
                .setPositiveButton("탈퇴") { _, _ -> withdraw(null) }
                .show()
        }
    }

    private fun withdraw(sharedItems: String?) {
        btnWithdraw.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = repo.withdraw(etPassword.text.toString(), sharedItems) ?: return@launch
                if (response.isSuccessful) {
                    // 로그인 정보를 지우고 로그인 화면으로 간다. (모든 화면을 닫는다.)
                    TokenManager(this@WithdrawActivity).clearToken()
                    Msg.showOnNextScreen("회원 탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.")
                    startActivity(
                        Intent(this@WithdrawActivity, LoginActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                    return@launch
                }

                when (ApiError.parse(response).code) {
                    "INVALID_PASSWORD" -> etPassword.error = "비밀번호가 올바르지 않아요."
                    "SHARED_ITEMS_CHOICE_REQUIRED" -> askSharedItems()
                    "UNSETTLED_EXPENSES" -> explainUnsettled()
                    "OWNER_MUST_TRANSFER" -> MaterialAlertDialogBuilder(this@WithdrawActivity)
                        .setTitle("방장을 먼저 넘겨 주세요")
                        .setMessage("다른 구성원이 있는 방의 방장은 탈퇴할 수 없어요.\n방 정보 탭의 구성원 목록에서 방장을 다른 사람에게 넘긴 뒤에 다시 시도해 주세요.")
                        .setPositiveButton("확인", null)
                        .show()
                    else -> Msg.show(this@WithdrawActivity, ApiError.messageOf(response, "탈퇴하지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@WithdrawActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnWithdraw.isEnabled = true
            }
        }
    }

    // 내가 등록한 공용 물품을 어떻게 할지 고른 뒤 다시 요청한다.
    private fun askSharedItems() {
        MaterialAlertDialogBuilder(this)
            .setTitle("내가 등록한 공용 물품")
            .setItems(arrayOf("방장에게 넘기기", "삭제하기")) { _, which ->
                withdraw(if (which == 0) "TRANSFER" else "DELETE")
            }
            .setNegativeButton("취소", null)
            .show()
    }

    // 정산이 남아 있으면 탈퇴할 수 없다. 정산 화면으로 바로 갈 수 있게 한다.
    private fun explainUnsettled() {
        MaterialAlertDialogBuilder(this)
            .setTitle("정산이 남아 있어요")
            .setMessage("받을 돈이나 보낼 돈이 남아 있으면 탈퇴할 수 없어요.\n정산을 모두 끝낸 뒤에 다시 시도해 주세요.")
            .setNegativeButton("닫기", null)
            .setPositiveButton("정산 보기") { _, _ ->
                lifecycleScope.launch {
                    try {
                        val room = RoomRepository(this@WithdrawActivity).getMyRoom()
                            ?.body()?.get("room")?.takeIf { it.isJsonObject }?.asJsonObject
                        val roomId = room?.get("roomId")?.asInt ?: return@launch
                        startActivity(
                            Intent(this@WithdrawActivity, ExpenseActivity::class.java)
                                .putExtra(ExpenseActivity.EXTRA_ROOM_ID, roomId)
                        )
                    } catch (_: Exception) {
                    }
                }
            }
            .show()
    }
}