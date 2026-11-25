package com.example.android_project.ui.memo

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.model.Memo
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/**
 * 메모 쓰기·보기·수정. 새로 쓸 때는 비어 있고, 목록에서 열면 내용이 채워진다.
 * 작성자와 방장이 아니면 읽기만 할 수 있다.
 */
class MemoEditActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_MEMO_JSON = "memoJson"
    }

    private var roomId = 0
    private var memo: Memo? = null
    private lateinit var etTitle: EditText
    private lateinit var etContent: EditText
    private lateinit var btnSave: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_memo_edit)
        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        memo = intent.getStringExtra(EXTRA_MEMO_JSON)?.let { Gson().fromJson(it, Memo::class.java) }

        etTitle = findViewById(R.id.etMemoTitle)
        etContent = findViewById(R.id.etMemoContent)
        btnSave = findViewById(R.id.btnSaveMemo)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        btnSave.setOnClickListener { save() }
        findViewById<View>(R.id.btnDeleteMemo).setOnClickListener { confirmDelete() }

        memo?.let { m ->
            findViewById<TextView>(R.id.tvMemoScreenTitle).text = if (m.canEdit) "메모 수정" else "메모"
            findViewById<TextView>(R.id.tvMemoAuthor).apply {
                visibility = View.VISIBLE
                text = "${m.author?.displayName() ?: "알 수 없음"} · ${m.updatedAt.take(16)}"
            }
            etTitle.setText(m.title)
            etContent.setText(m.content.orEmpty())
            if (m.canEdit) {
                findViewById<View>(R.id.btnDeleteMemo).visibility = View.VISIBLE
            } else {
                // 남의 메모는 읽기만 할 수 있다.
                etTitle.isEnabled = false
                etContent.isEnabled = false
                btnSave.visibility = View.GONE
                findViewById<View>(R.id.tvMemoReadOnly).visibility = View.VISIBLE
            }
        }
    }

    private fun save() {
        val title = etTitle.text.toString().trim()
        if (title.isEmpty()) {
            etTitle.error = "제목을 입력해 주세요."
            return
        }
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        // 내용은 비우면 null로 보내 지운다. (null도 서버에 전달되도록 JsonObject에 직접 담는다.)
        val body = JsonObject().apply {
            addProperty("title", title)
            addProperty("content", etContent.text.toString().trim().ifEmpty { null })
        }

        btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val m = memo
                val response = if (m == null) RetrofitClient.memoApiService.create(token, roomId, body)
                else RetrofitClient.memoApiService.update(token, roomId, m.memoId, body)
                if (response.isSuccessful) {
                    Msg.show(this@MemoEditActivity, if (m == null) "메모를 남겼어요." else "메모를 저장했어요.")
                    finish()
                } else {
                    Msg.show(this@MemoEditActivity, ApiError.messageOf(response, "저장하지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@MemoEditActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnSave.isEnabled = true
            }
        }
    }

    private fun confirmDelete() {
        val m = memo ?: return
        MaterialAlertDialogBuilder(this)
            .setTitle("메모 삭제")
            .setMessage("이 메모를 삭제할까요? 삭제하면 되돌릴 수 없어요.")
            .setNegativeButton("취소", null)
            .setPositiveButton("삭제") { _, _ ->
                val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return@setPositiveButton
                lifecycleScope.launch {
                    try {
                        val response = RetrofitClient.memoApiService.delete(token, roomId, m.memoId)
                        if (response.isSuccessful) {
                            Msg.show(this@MemoEditActivity, "메모를 삭제했어요.")
                            finish()
                        } else {
                            Msg.show(this@MemoEditActivity, ApiError.messageOf(response, "삭제하지 못했어요."), true)
                        }
                    } catch (e: Exception) {
                        Msg.show(this@MemoEditActivity, "서버에 연결할 수 없어요.")
                    }
                }
            }
            .show()
    }
}