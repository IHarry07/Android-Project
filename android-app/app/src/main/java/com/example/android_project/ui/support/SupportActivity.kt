package com.example.android_project.ui.support

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
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

/** 고객센터: 자주 묻는 질문, 문의하기, 내 문의와 답변. 운영자 문의처가 정해지기 전에는 이 화면으로 문의를 받는다. */
class SupportActivity : BaseActivity() {

    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_support)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<View>(R.id.btnFaq).setOnClickListener { startActivity(Intent(this, FaqActivity::class.java)) }
        findViewById<View>(R.id.btnNewInquiry).setOnClickListener { startActivity(Intent(this, InquiryFormActivity::class.java)) }
    }

    // 문의를 남기고 돌아왔을 때나 답변이 달렸을 때 바로 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return
        val container = findViewById<ViewGroup>(R.id.layoutInquiries)
        val empty = findViewById<View>(R.id.tvInquiryEmpty)
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.inquiryApiService.list(token)
                if (!response.isSuccessful) {
                    Msg.show(this@SupportActivity, ApiError.messageOf(response, "문의를 불러오지 못했어요."))
                    return@launch
                }
                val list = response.body()?.getAsJsonArray("inquiries")?.map { gson.fromJson(it, Inquiry::class.java) }.orEmpty()
                container.removeAllViews()
                empty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                for (q in list) {
                    val row = LayoutInflater.from(this@SupportActivity).inflate(R.layout.item_inquiry, container, false)
                    row.findViewById<TextView>(R.id.tvInquiryTitle).text = q.title
                    row.findViewById<TextView>(R.id.tvInquiryDate).text = q.createdAt.take(10)
                    row.findViewById<TextView>(R.id.tvInquiryState).apply {
                        text = if (q.isAnswered) "답변 완료" else "답변 대기"
                        setTextColor(getColor(if (q.isAnswered) R.color.rm_kind_cleaning else R.color.rm_primary))
                    }
                    row.setOnClickListener {
                        startActivity(
                            Intent(this@SupportActivity, InquiryDetailActivity::class.java)
                                .putExtra(InquiryDetailActivity.EXTRA_INQUIRY_ID, q.inquiryId)
                        )
                    }
                    container.addView(row)
                }
            } catch (e: Exception) {
                Msg.show(this@SupportActivity, "서버에 연결할 수 없어요.")
            }
        }
    }
}