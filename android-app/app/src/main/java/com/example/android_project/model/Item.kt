package com.example.android_project.model

// 서버의 물품 (category: FOOD/SUPPLY, ownershipType: PERSONAL/SHARED)
data class Item(
    val itemId: Int,
    val name: String,
    val category: String,
    val ownershipType: String,
    val ownerUserId: Int,
    val ownerNickname: String?,
    val quantity: Double,
    val unit: String?,
    val expiryDate: String?,
    val daysUntilExpiry: Int?,
    val storageLocation: String?,
    val status: String
) {
    // 수량 표시. 3.0 → "3", 1.5 → "1.5"
    fun quantityText(): String {
        val number = if (quantity % 1.0 == 0.0) quantity.toLong().toString() else quantity.toString()
        return number + (unit?.takeIf { it.isNotBlank() } ?: "개")
    }
}

data class CreateItemRequest(
    val name: String,
    val category: String,
    val ownershipType: String,
    val quantity: Double,
    val unit: String? = null,
    val expiryDate: String? = null,
    val storageLocation: String? = null
)

data class AdjustItemRequest(
    val delta: Double
)
