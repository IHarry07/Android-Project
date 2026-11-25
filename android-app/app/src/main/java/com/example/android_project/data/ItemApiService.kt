package com.example.android_project.data

import com.example.android_project.model.AdjustItemRequest
import com.example.android_project.model.CreateItemRequest
import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import okhttp3.RequestBody
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ItemApiService {

    // 물품 목록 ({"items": [...]})
    // scope: all / mine / shared,  category: FOOD / SUPPLY (없으면 전체)
    @GET("api/rooms/{roomId}/items")
    suspend fun listItems(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("scope") scope: String,
        @Query("category") category: String?,
        @Query("expiringWithinDays") expiringWithinDays: Int?
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/items")
    suspend fun createItem(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: CreateItemRequest
    ): Response<JsonObject>

    // 수량 조정 (delta: 늘리면 +, 줄이면 -)
    @POST("api/rooms/{roomId}/items/{itemId}/adjust")
    suspend fun adjustItem(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("itemId") itemId: Int,
        @Body request: AdjustItemRequest
    ): Response<JsonObject>

    // QR 주소로 상품명 조회 ({"productName": "..."})
    @GET("api/products/lookup")
    suspend fun lookupProduct(
        @Header("Authorization") token: String,
        @Query("url") url: String
    ): Response<JsonObject>

    // 물품 수정. 값을 지우려면(null) 직접 만든 JSON을 보내야 해서 RequestBody로 받는다.
    @PATCH("api/rooms/{roomId}/items/{itemId}")
    suspend fun updateItem(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("itemId") itemId: Int,
        @Body body: RequestBody
    ): Response<JsonObject>

    @DELETE("api/rooms/{roomId}/items/{itemId}")
    suspend fun deleteItem(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("itemId") itemId: Int
    ): Response<Void>
}
