package com.example.android_project.data

import android.content.Context
import com.example.android_project.model.AdjustItemRequest
import com.example.android_project.model.CreateItemRequest
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

class ItemRepository(context: Context) {

    private val tokenManager = TokenManager(context)
    private val api = RetrofitClient.itemApiService

    private fun auth(): String? = tokenManager.getToken()?.let { "Bearer $it" }

    suspend fun list(
        roomId: Int,
        scope: String = "all",
        category: String? = null,
        expiringWithinDays: Int? = null
    ): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.listItems(token, roomId, scope, category, expiringWithinDays)
    }

    suspend fun create(roomId: Int, request: CreateItemRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.createItem(token, roomId, request)
    }

    suspend fun adjust(roomId: Int, itemId: Int, delta: Double): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.adjustItem(token, roomId, itemId, AdjustItemRequest(delta))
    }

    suspend fun lookupProduct(qrValue: String): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.lookupProduct(token, qrValue)
    }

    // 바꿀 항목만 담은 JSON. JsonNull은 서버에 null(값 지우기)로 전달된다.
    suspend fun update(roomId: Int, itemId: Int, changes: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        val body = changes.toString().toRequestBody("application/json".toMediaType())
        return api.updateItem(token, roomId, itemId, body)
    }

    suspend fun delete(roomId: Int, itemId: Int): Response<Void>? {
        val token = auth() ?: return null
        return api.deleteItem(token, roomId, itemId)
    }
}
