package com.example.android_project.data

import android.content.Context
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import retrofit2.Response

class ExpenseRepository(context: Context) {

    private val tokenManager = TokenManager(context)
    private val api = RetrofitClient.expenseApiService

    private fun auth(): String? = tokenManager.getToken()?.let { "Bearer $it" }

    suspend fun list(roomId: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.list(token, roomId, 100)
    }

    suspend fun balances(roomId: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.balances(token, roomId)
    }

    suspend fun get(roomId: Int, expenseId: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.get(token, roomId, expenseId)
    }

    suspend fun create(roomId: Int, body: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.create(token, roomId, body)
    }

    suspend fun update(roomId: Int, expenseId: Int, body: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.update(token, roomId, expenseId, body)
    }

    suspend fun delete(roomId: Int, expenseId: Int): Response<Void>? {
        val token = auth() ?: return null
        return api.delete(token, roomId, expenseId)
    }

    suspend fun settle(roomId: Int, expenseId: Int, userId: Int, isSettled: Boolean): Response<JsonObject>? {
        val token = auth() ?: return null
        val body = JsonObject().apply { addProperty("isSettled", isSettled) }
        return api.settle(token, roomId, expenseId, userId, body)
    }
}