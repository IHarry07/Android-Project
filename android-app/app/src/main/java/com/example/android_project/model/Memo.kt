package com.example.android_project.model

// 공동 메모 (방 구성원 모두가 본다). canEdit: 내가 고치거나 지울 수 있는지(작성자 또는 방장)
data class Memo(
    val memoId: Int,
    val title: String,
    val content: String? = null,
    val author: UserLabel? = null,
    val canEdit: Boolean = false,
    val createdAt: String = "",
    val updatedAt: String = ""
)