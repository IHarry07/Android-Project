package com.example.android_project.model

class RoomRequest {
    // 방 생성 요청 (description, capacity는 비우면 보내지 않는다. 서버 기본 정원은 10명)
    data class CreateRoomRequest(
        val roomName: String,
        val description: String? = null,
        val capacity: Int? = null
    )
    // 방 참여 요청 (서버 필드명은 code)
    data class JoinRoomRequest(
        val code: String
    )
    // 방장 넘기기 요청
    data class TransferOwnerRequest(
        val userId: Int
    )
}
