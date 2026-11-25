package com.example.android_project.ui.support

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/** 문의하기: 제목과 내용을 남긴다. */
class InquiryFormActivity : BaseActivity() {

    private lateinit var etTitle: EditText
    private lateinit var etContent: EditText
    private lateinit var btnSend: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_inquiry_form)
        etTitle = findViewById(R.id.etInquiryTitle)
        etContent = findViewById(R.id.etInquiryContent)
        btnSend = findViewById(R.id.btnSendInquiry)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        btnSend.setOnClickListener { send() }
    }

    private fun send() {
        val title = etTitle.text.toString().trim()
        val content = etContent.text.toString().trim()
        if (title.isEmpty()) { etTitle.error = "제목을 입력해 주세요."; return }
        if (content.isEmpty()) { etContent.error = "내용을 입력해 주세요."; return }
        val token = TokenManager(this).getToken()?.let { "Bearer $it" } ?: return

        btnSend.isEnabled = false
        lifecycleScope.launch {
            try {
                val body = JsonObject().apply { addProperty("title", title); addProperty("content", content) }
                val response = RetrofitClient.inquiryApiService.create(token, body)
                if (response.isSuccessful) {
                    Msg.show(this@InquiryFormActivity, "문의를 남겼어요. 답변이 등록되면 내 문의에서 확인할 수 있어요.", true)
                    finish()
                } else {
                    Msg.show(this@InquiryFormActivity, ApiError.messageOf(response, "문의를 남기지 못했어요."), true)
                }
            } catch (e: Exception) {
                Msg.show(this@InquiryFormActivity, "서버에 연결할 수 없어요.")
            } finally {
                btnSend.isEnabled = true
            }
        }
    }
}