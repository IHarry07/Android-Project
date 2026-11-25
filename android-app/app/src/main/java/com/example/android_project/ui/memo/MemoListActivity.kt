package com.example.android_project.ui.memo

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.model.Memo
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import kotlinx.coroutines.launch

/** 공동 메모 목록: 방 구성원 모두가 보는 메모. 눌러서 읽고(작성자·방장은 고치고), 위의 버튼으로 새로 쓴다. */
class MemoListActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
    }

    private var roomId = 0
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_memo_list)
        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<View>(R.id.btnAddMemo).setOnClickListener {
            startActivity(Intent(this, MemoEditActivity::class.java).putExtra(MemoEditActivity.EXTRA_ROOM_ID, roomId))
        }
    }

    // 쓰고 돌아왔을 때 최신 목록이 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        val container = findViewById<ViewGroup>(R.id.layoutMemos)
        val empty = findViewById<View>(R.id.tvMemoEmpty)
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.memoApiService.list(token, roomId, 100)
                if (!response.isSuccessful) {
                    Msg.show(this@MemoListActivity, ApiError.messageOf(response, "메모를 불러오지 못했어요."))
                    return@launch
                }
                val memos = response.body()?.getAsJsonArray("memos")?.map { gson.fromJson(it, Memo::class.java) }.orEmpty()
                container.removeAllViews()
                empty.visibility = if (memos.isEmpty()) View.VISIBLE else View.GONE
                for (m in memos) {
                    val row = LayoutInflater.from(this@MemoListActivity).inflate(R.layout.item_memo, container, false)
                    row.findViewById<TextView>(R.id.tvMemoTitle).text = m.title
                    row.findViewById<TextView>(R.id.tvMemoPreview).apply {
                        text = m.content.orEmpty()
                        visibility = if (m.content.isNullOrBlank()) View.GONE else View.VISIBLE
                    }
                    row.findViewById<TextView>(R.id.tvMemoMeta).text =
                        "${m.author?.displayName() ?: "알 수 없음"} · ${m.updatedAt.take(10)}"
                    row.setOnClickListener {
                        startActivity(
                            Intent(this@MemoListActivity, MemoEditActivity::class.java)
                                .putExtra(MemoEditActivity.EXTRA_ROOM_ID, roomId)
                                .putExtra(MemoEditActivity.EXTRA_MEMO_JSON, gson.toJson(m))
                        )
                    }
                    container.addView(row)
                }
            } catch (e: Exception) {
                Msg.show(this@MemoListActivity, "서버에 연결할 수 없어요.")
            }
        }
    }
}