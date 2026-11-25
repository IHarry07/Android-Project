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

interface MemoApiService {

    @GET("api/rooms/{roomId}/memos")
    suspend fun list(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("limit") limit: Int
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/memos")
    suspend fun create(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body body: JsonObject
    ): Response<JsonObject>

    @PATCH("api/rooms/{roomId}/memos/{memoId}")
    suspend fun update(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("memoId") memoId: Int,
        @Body body: JsonObject
    ): Response<JsonObject>

    @DELETE("api/rooms/{roomId}/memos/{memoId}")
    suspend fun delete(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("memoId") memoId: Int
    ): Response<Void>
}