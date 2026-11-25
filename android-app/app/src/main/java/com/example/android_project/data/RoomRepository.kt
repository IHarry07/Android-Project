package com.example.android_project.data
import com.example.android_project.util.TokenManager

import android.content.Context
import com.example.android_project.model.RoomRequest

import com.google.gson.JsonObject
import retrofit2.Response

class RoomRepository(context: Context) {

    // JWT 토큰 관리 객체
    private val tokenManager = TokenManager(context)

    // 방 관리 API 객체
    private val apiService = RetrofitClient.roomApiService

    // 토큰 가져오기
    private fun getAuthToken(): String? {
        val token = tokenManager.getToken()

        return token?.let {
            "Bearer $it"
        }
    }

    // 1. 방 생성
    suspend fun createRoom(
        roomName: String,
        description: String? = null,
        capacity: Int? = null
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        val request = RoomRequest.CreateRoomRequest(roomName, description, capacity)

        return apiService.createRoom(token, request)
    }

    // 1-1. 방 정보 수정 (방장만 가능)
    suspend fun updateRoom(
        roomId: Int,
        roomName: String,
        description: String,
        capacity: Int?
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        val body = JsonObject().apply {
            addProperty("roomName", roomName)
            addProperty("description", description)
            if (capacity != null) addProperty("capacity", capacity)
        }

        return apiService.updateRoom(token, roomId, body)
    }

    // 2. 방 참여
    suspend fun joinRoom(
        roomCode: String
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        val request = RoomRequest.JoinRoomRequest(roomCode)

        return apiService.joinRoom(token, request)
    }

    // 3. 내가 참여한 방 조회 (없으면 응답의 room이 null)
    suspend fun getMyRoom(): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.getMyRoom(token)
    }

    // 3-1. 방 구성원 목록 조회
    suspend fun getRoomMembers(
        roomId: Int
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.getRoomMembers(token, roomId)
    }

    // 4. 방 상세 정보 조회
    suspend fun getRoomDetail(
        roomId: Int
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.getRoomDetail(token, roomId)
    }

    // 5. 방 나가기 (방장이 혼자 남은 상태에서 나가면 방이 삭제된다)
    //    sharedItems: 내가 등록한 공용 물품이 있을 때 "TRANSFER" 또는 "DELETE". 없으면 null
    suspend fun leaveRoom(
        roomId: Int,
        sharedItems: String? = null
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.leaveRoom(token, roomId, sharedItems)
    }

    // 5-1. 초대 코드 재생성 (방장만 가능)
    suspend fun createInvitation(
        roomId: Int
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.createInvitation(token, roomId, JsonObject())
    }

    // 6. 방장 넘기기 (방장만 가능)
    suspend fun transferOwner(
        roomId: Int,
        userId: Int
    ): Response<JsonObject>? {

        val token = getAuthToken() ?: return null

        return apiService.transferOwner(
            token,
            roomId,
            RoomRequest.TransferOwnerRequest(userId)
        )
    }
}
