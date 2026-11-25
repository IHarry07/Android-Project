package com.example.android_project.model

// 고객센터 문의. status: WAITING(답변 대기) / ANSWERED(답변 완료)
data class Inquiry(
    val inquiryId: Int,
    val title: String,
    val content: String,
    val status: String,
    val answer: String? = null,
    val answeredAt: String? = null,
    val createdAt: String = ""
) {
    val isAnswered: Boolean get() = status == "ANSWERED"
}