package com.example.android_project.ui.room

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

// 초대 코드를 보여주는 창. 코드는 서버가 만들 때 한 번만 알려주므로 확인을 눌러야 닫힌다.
object RoomInviteCodeDialog {

    fun show(context: Context, title: String, code: String, onClose: () -> Unit = {}) {
        val dialog = com.google.android.material.dialog.MaterialAlertDialogBuilder(context)
            .setTitle(title)
            .setMessage(
                "룸메이트에게 아래 초대 코드를 알려 주세요.\n\n" +
                    "$code\n\n" +
                    "이 코드는 지금만 확인할 수 있어요."
            )
            .setCancelable(false)
            .setPositiveButton("확인") { _, _ -> onClose() }
            .setNeutralButton("코드 복사", null)
            .create()
        dialog.show()

        // 복사한 뒤에도 창이 닫히지 않도록 직접 클릭 처리
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("초대 코드", code))
            com.example.android_project.util.Msg.makeText(context, "초대 코드를 복사했어요.", Toast.LENGTH_SHORT).show()
        }
    }

    private const val INTRO =
        "초대 코드는 만들 때 한 번만 볼 수 있어요.\n" +
            "새 코드를 만들면 이전 코드는 쓸 수 없게 돼요."

    /**
     * 초대 코드 만들기 팝업 하나로 안내와 코드 확인을 모두 처리한다.
     * "새 코드 만들기"를 누르면 같은 팝업이 코드를 보여주는 화면으로 바뀐다.
     * create: 코드를 만들고 결과를 done(코드, 오류메시지)으로 알려 준다.
     */
    fun showManage(context: Context, create: (done: (code: String?, error: String?) -> Unit) -> Unit) {
        val dialog = com.google.android.material.dialog.MaterialAlertDialogBuilder(context)
            .setTitle("초대 코드")
            .setMessage(INTRO)
            .setPositiveButton("새 코드 만들기", null)
            .setNegativeButton("닫기", null)
            .create()
        dialog.show()

        val positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        val negative = dialog.getButton(AlertDialog.BUTTON_NEGATIVE)

        positive.setOnClickListener {
            positive.isEnabled = false
            create { code, error ->
                if (code == null) {
                    // 팝업이 열려 있는 동안에는 안내문 자리에 오류를 보여준다.
                    positive.isEnabled = true
                    dialog.setMessage((error ?: "초대 코드를 만들지 못했어요.") + "\n\n" + INTRO)
                } else {
                    // 코드는 지금만 볼 수 있으므로 확인을 눌러야 닫힌다.
                    dialog.setCancelable(false)
                    dialog.setCanceledOnTouchOutside(false)
                    dialog.setTitle("새 초대 코드")
                    dialog.setMessage(
                        "룸메이트에게 아래 초대 코드를 알려 주세요.\n\n" +
                            "$code\n\n" +
                            "이 코드는 지금만 확인할 수 있어요. 이전 코드는 이제 쓸 수 없어요."
                    )
                    negative.text = "확인"
                    positive.text = "코드 복사"
                    positive.isEnabled = true
                    positive.setOnClickListener {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("초대 코드", code))
                        positive.text = "복사했어요"
                    }
                }
            }
        }
    }}
