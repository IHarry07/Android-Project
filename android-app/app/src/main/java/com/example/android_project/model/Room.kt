package com.example.android_project.model

// 서버의 방 정보 (GET /api/rooms/me 응답의 room)
// 초대 코드는 서버가 해시로만 저장하므로 여기에는 없다. (방을 만들거나 재발급할 때 한 번만 받는다.)
data class Room(
    val roomId: Int,
    val roomName: String,
    val description: String?,
    val capacity: Int,
    val memberCount: Int,
    val isOwner: Boolean,
    val createdAt: String
)
