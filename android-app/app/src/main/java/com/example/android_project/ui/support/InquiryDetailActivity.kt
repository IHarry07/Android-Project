package com.example.android_project.ui.support

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.model.Inquiry
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import kotlinx.coroutines.launch

/** 내 문의 상세: 내가 남긴 내용과 운영자 답변. */
class InquiryDetailActivity : BaseActivity() {

    companion object {
        const val EXTRA_INQUIRY_ID = "inquiryId"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_inquiry_detail)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }

        val id = intent.getIntExtra(EXTRA_INQUIRY_ID, 0)
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.inquiryApiService.get(token, id)
                if (!response.isSuccessful) {
                    Msg.show(this@InquiryDetailActivity, ApiError.messageOf(response, "문의를 불러오지 못했어요."))
                    return@launch
                }
                val q = Gson().fromJson(response.body()?.getAsJsonObject("inquiry"), Inquiry::class.java)
                findViewById<TextView>(R.id.tvDetailTitle).text = q.title
                findViewById<TextView>(R.id.tvDetailMeta).text = "${q.createdAt.take(16)} · ${if (q.isAnswered) "답변 완료" else "답변 대기"}"
                findViewById<TextView>(R.id.tvDetailContent).text = q.content
                findViewById<TextView>(R.id.tvAnswerLabel).text =
                    if (q.isAnswered) "운영자 답변 · ${q.answeredAt?.take(16).orEmpty()}" else "답변 대기 중"
                findViewById<TextView>(R.id.tvAnswer).text =
                    if (q.isAnswered) q.answer.orEmpty() else "운영자가 확인하고 있어요. 답변이 등록되면 이곳에서 볼 수 있어요."
            } catch (e: Exception) {
                Msg.show(this@InquiryDetailActivity, "서버에 연결할 수 없어요.")
            }
        }
    }
}