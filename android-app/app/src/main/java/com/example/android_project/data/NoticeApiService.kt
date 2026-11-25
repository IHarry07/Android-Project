package com.example.android_project.data

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import retrofit2.http.Query

interface NoticeApiService {

    // 공지 목록 ({"notices": [{noticeId, title, isPinned, createdAt}]}), 고정 공지가 먼저
    @GET("api/notices")
    suspend fun list(
        @Header("Authorization") token: String,
        @Query("limit") limit: Int
    ): Response<JsonObject>

    // 공지 상세 ({"notice": {..., body}})
    @GET("api/notices/{noticeId}")
    suspend fun get(
        @Header("Authorization") token: String,
        @Path("noticeId") noticeId: Int
    ): Response<JsonObject>
}