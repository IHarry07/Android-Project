package com.example.android_project.model

// 서버의 구성원 정보 (GET /api/rooms/:roomId/members 응답의 members 항목)
data class RoomMember(
    val userId: Int,
    val nickname: String,
    val isOwner: Boolean,
    val joinedAt: String,
    // 프로필 사진이 있고 보여도 되는 경우에만 값이 있다.
    val photoVersion: Long? = null
)
