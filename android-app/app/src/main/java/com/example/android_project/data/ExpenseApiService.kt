package com.example.android_project.data

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

interface ExpenseApiService {

    // 지출 목록 ({"expenses": [...]}), 최신 날짜순
    @GET("api/rooms/{roomId}/expenses")
    suspend fun list(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("limit") limit: Int
    ): Response<JsonObject>

    // 나와 다른 사람 사이의 미정산 금액 ({"balances": [...], "totalToReceive", "totalToPay"})
    @GET("api/rooms/{roomId}/expenses/balances")
    suspend fun balances(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int
    ): Response<JsonObject>

    @GET("api/rooms/{roomId}/expenses/{expenseId}")
    suspend fun get(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("expenseId") expenseId: Int
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/expenses")
    suspend fun create(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body body: JsonObject
    ): Response<JsonObject>

    @PATCH("api/rooms/{roomId}/expenses/{expenseId}")
    suspend fun update(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("expenseId") expenseId: Int,
        @Body body: JsonObject
    ): Response<JsonObject>

    @DELETE("api/rooms/{roomId}/expenses/{expenseId}")
    suspend fun delete(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("expenseId") expenseId: Int
    ): Response<Void>

    // 정산 완료 표시/취소 (돈을 받은 결제자만)
    @PATCH("api/rooms/{roomId}/expenses/{expenseId}/shares/{userId}")
    suspend fun settle(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("expenseId") expenseId: Int,
        @Path("userId") userId: Int,
        @Body body: JsonObject
    ): Response<JsonObject>
}