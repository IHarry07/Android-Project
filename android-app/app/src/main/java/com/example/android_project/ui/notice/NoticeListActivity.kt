package com.example.android_project.ui.notice

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import kotlinx.coroutines.launch

/** 서비스 공지사항 목록. 고정한 공지가 맨 위에 나온다. */
class NoticeListActivity : BaseActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notice_list)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        load()
    }

    private fun load() {
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        val container = findViewById<ViewGroup>(R.id.layoutNotices)
        val empty = findViewById<View>(R.id.tvNoticeEmpty)
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.noticeApiService.list(token, 50)
                if (!response.isSuccessful) {
                    Msg.show(this@NoticeListActivity, ApiError.messageOf(response, "공지사항을 불러오지 못했어요."))
                    return@launch
                }
                val list = response.body()?.getAsJsonArray("notices") ?: return@launch
                container.removeAllViews()
                empty.visibility = if (list.size() == 0) View.VISIBLE else View.GONE
                for (element in list) {
                    val n = element.asJsonObject
                    val row = LayoutInflater.from(this@NoticeListActivity).inflate(R.layout.item_notice, container, false)
                    row.findViewById<View>(R.id.tvNoticePin).visibility =
                        if (n.get("isPinned").asBoolean) View.VISIBLE else View.GONE
                    row.findViewById<TextView>(R.id.tvNoticeTitle).text = n.get("title").asString
                    row.findViewById<TextView>(R.id.tvNoticeDate).text = n.get("createdAt").asString.take(10)
                    val id = n.get("noticeId").asInt
                    row.setOnClickListener {
                        startActivity(
                            Intent(this@NoticeListActivity, NoticeDetailActivity::class.java)
                                .putExtra(NoticeDetailActivity.EXTRA_NOTICE_ID, id)
                        )
                    }
                    container.addView(row)
                }
            } catch (e: Exception) {
                Msg.show(this@NoticeListActivity, "서버에 연결할 수 없어요.")
            }
        }
    }
}