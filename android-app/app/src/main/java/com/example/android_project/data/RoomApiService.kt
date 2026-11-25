package com.example.android_project.data

import com.example.android_project.model.RoomRequest
import com.google.gson.JsonObject

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface RoomApiService {

    // 방 생성
    @POST("api/rooms")
    suspend fun createRoom(
        @Header("Authorization") token: String,
        @Body request: RoomRequest.CreateRoomRequest
    ): Response<JsonObject>

    // 방 참여
    // 방 이름·소개·최대 인원 수정 (방장만). 소개를 비우려면 빈 문자열을 보낸다.
    @PATCH("api/rooms/{roomId}")
    suspend fun updateRoom(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: JsonObject
    ): Response<JsonObject>

    @POST("api/rooms/join")
    suspend fun joinRoom(
        @Header("Authorization") token: String,
        @Body request: RoomRequest.JoinRoomRequest
    ): Response<JsonObject>

    // 내가 참여한 방 조회 (서버는 한 사람이 방 하나만 가입할 수 있다. 방이 없으면 {"room": null})
    @GET("api/rooms/me")
    suspend fun getMyRoom(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    // 방 구성원 목록 조회 ({"members": [...]})
    @GET("api/rooms/{roomId}/members")
    suspend fun getRoomMembers(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int
    ): Response<JsonObject>

    // 방 상세 정보 조회
    @GET("api/rooms/{roomId}")
    suspend fun getRoomDetail(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int
    ): Response<JsonObject>

    // 방 나가기. 방장이 혼자 남은 상태에서 나가면 서버가 방을 삭제한다. (응답의 roomDeleted)
    // sharedItems: 내가 등록한 공용 물품이 있을 때 TRANSFER(방장에게 넘김) 또는 DELETE(삭제). 없으면 null
    @DELETE("api/rooms/{roomId}/members/me")
    suspend fun leaveRoom(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("sharedItems") sharedItems: String?
    ): Response<JsonObject>

    // 초대 코드 재생성 (방장만 가능). 이전 코드는 바로 쓸 수 없게 되고, 새 코드는 이 응답에서만 볼 수 있다.
    // 응답: {"invite": {"code": "...", "expiresAt": "..."}}
    @POST("api/rooms/{roomId}/invitations")
    suspend fun createInvitation(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: JsonObject
    ): Response<JsonObject>

    // 방장 넘기기 (방장만 가능)
    @POST("api/rooms/{roomId}/transfer-owner")
    suspend fun transferOwner(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: RoomRequest.TransferOwnerRequest
    ): Response<JsonObject>
}
