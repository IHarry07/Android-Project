package com.example.android_project.ui.notice

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import kotlinx.coroutines.launch

/** 공지사항 상세. */
class NoticeDetailActivity : BaseActivity() {

    companion object {
        const val EXTRA_NOTICE_ID = "noticeId"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notice_detail)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }

        val id = intent.getIntExtra(EXTRA_NOTICE_ID, 0)
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.noticeApiService.get(token, id)
                if (!response.isSuccessful) {
                    Msg.show(this@NoticeDetailActivity, ApiError.messageOf(response, "공지를 불러오지 못했어요."))
                    return@launch
                }
                val n = response.body()?.getAsJsonObject("notice") ?: return@launch
                findViewById<TextView>(R.id.tvDetailTitle).text = n.get("title").asString
                findViewById<TextView>(R.id.tvDetailDate).text = n.get("createdAt").asString.take(10)
                findViewById<TextView>(R.id.tvDetailBody).text = n.get("body").asString
            } catch (e: Exception) {
                Msg.show(this@NoticeDetailActivity, "서버에 연결할 수 없어요.")
            }
        }
    }
}