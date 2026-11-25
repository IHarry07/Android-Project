package com.example.android_project.data

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import retrofit2.http.Query

interface SearchApiService {

    // 통합 검색 ({"query", "counts": {all, food, supply, schedule}, "results": [{type, id, title, line1, line2}]})
    @GET("api/rooms/{roomId}/search")
    suspend fun search(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("q") query: String
    ): Response<JsonObject>
}