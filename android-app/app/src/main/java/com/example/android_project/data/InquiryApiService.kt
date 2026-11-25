package com.example.android_project.data

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface InquiryApiService {

    // 내 문의 목록 ({"inquiries": [...]}), 최신순
    @GET("api/inquiries")
    suspend fun list(@Header("Authorization") token: String): Response<JsonObject>

    @GET("api/inquiries/{inquiryId}")
    suspend fun get(
        @Header("Authorization") token: String,
        @Path("inquiryId") inquiryId: Int
    ): Response<JsonObject>

    // 문의 남기기: {title, content}
    @POST("api/inquiries")
    suspend fun create(
        @Header("Authorization") token: String,
        @Body body: JsonObject
    ): Response<JsonObject>
}