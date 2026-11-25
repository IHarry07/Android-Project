package com.example.android_project.data

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.DELETE
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface NotificationApiService {

    // 알림 목록 (최신순). 응답: {"notifications": [...], "unreadCount": 3, "nextBeforeId": 12 또는 null}
    // filter: all / unread / read,  beforeId: 이 번호보다 오래된 것부터
    @GET("api/notifications")
    suspend fun list(
        @Header("Authorization") token: String,
        @Query("filter") filter: String,
        @Query("limit") limit: Int,
        @Query("beforeId") beforeId: Int?
    ): Response<JsonObject>

    // 읽지 않은 개수 ({"unreadCount": 3})
    @GET("api/notifications/unread-count")
    suspend fun unreadCount(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    @PATCH("api/notifications/{id}/read")
    suspend fun markRead(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): Response<JsonObject>

    @POST("api/notifications/read-all")
    suspend fun markAllRead(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    @DELETE("api/notifications/{id}")
    suspend fun delete(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): Response<Void>

    // 읽은 알림 모두 삭제
    @DELETE("api/notifications/read")
    suspend fun deleteAllRead(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    // 알림 종류별 푸시 설정 ({"settings": {itemExpiry, cleaning, schedule, expense}})
    @GET("api/users/me/notification-settings")
    suspend fun getSettings(@Header("Authorization") token: String): Response<JsonObject>

    @PATCH("api/users/me/notification-settings")
    suspend fun updateSettings(
        @Header("Authorization") token: String,
        @Body body: JsonObject
    ): Response<JsonObject>

    // 푸시 알림을 받을 기기 토큰 등록 / 해제 (해제는 로그인이 풀려도 토큰만으로 가능)
    @POST("api/devices")
    suspend fun registerDevice(
        @Header("Authorization") token: String,
        @Body body: JsonObject
    ): Response<Void>

    @HTTP(method = "DELETE", path = "api/devices", hasBody = true)
    suspend fun unregisterDevice(@Body body: JsonObject): Response<Void>
}