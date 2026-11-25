package com.example.android_project.ui.item

import com.example.android_project.data.ItemRepository
import com.example.android_project.model.Item
import com.example.android_project.util.ApiError
import com.google.gson.Gson
import retrofit2.Response
import com.google.gson.JsonObject

/**
 * 서버에서 불러온 방의 물품.
 *  - shared: 공용 물품 전체
 *  - mine:   내가 등록한 물품 전체 (공용·개인 모두)
 *  - others: 다른 구성원이 등록한 개인 물품 (읽기만 할 수 있다)
 */
data class Stock(val shared: List<Item>, val mine: List<Item>, val others: List<Item>) {
    val myFood: List<Item>
        get() = mine.filter { it.category == "FOOD" && it.ownershipType == "PERSONAL" }

    val sharedFood: List<Item>
        get() = shared.filter { it.category == "FOOD" }

    // 다른 구성원이 등록한 개인 음식 (냉장고의 "구성원 음식" 탭, 읽기 전용)
    val othersFood: List<Item>
        get() = others.filter { it.category == "FOOD" }

    // 방에 있는 모든 물품 (공용 + 내 물품 + 다른 구성원의 개인 물품)
    val all: List<Item>
        get() = (shared + mine + others).distinctBy { it.itemId }

    // 내가 고치거나 지울 수 있는 물품인지. 공용 물품은 구성원 누구나, 개인 물품은 등록한 사람만 가능하다.
    fun isEditable(item: Item): Boolean =
        item.ownershipType == "SHARED" || mine.any { it.itemId == item.itemId }

    // 유통기한이 3일 이내이거나 지난 음식 (냉장고에 보이는 모든 음식)
    val expiringFood: List<Item>
        get() = all.filter { it.category == "FOOD" && (it.daysUntilExpiry ?: Int.MAX_VALUE) <= 3 }
}

object StockLoader {

    // 성공하면 Stock, 실패하면 오류 메시지
    suspend fun load(repo: ItemRepository, roomId: Int): Pair<Stock?, String?> {
        val allResponse = repo.list(roomId, scope = "all")
            ?: return null to "로그인이 필요합니다."
        val mineResponse = repo.list(roomId, scope = "mine")
            ?: return null to "로그인이 필요합니다."

        if (!allResponse.isSuccessful) return null to ApiError.messageOf(allResponse, "물품을 불러오지 못했습니다.")
        if (!mineResponse.isSuccessful) return null to ApiError.messageOf(mineResponse, "물품을 불러오지 못했습니다.")

        val all = parse(allResponse)
        val mine = parse(mineResponse)
        val mineIds = mine.map { it.itemId }.toSet()

        return Stock(
            shared = all.filter { it.ownershipType == "SHARED" },
            mine = mine,
            others = all.filter { it.ownershipType == "PERSONAL" && it.itemId !in mineIds }
        ) to null
    }

    private fun parse(response: Response<JsonObject>): List<Item> {
        val array = response.body()?.getAsJsonArray("items") ?: return emptyList()
        return Gson().fromJson(array, Array<Item>::class.java).toList()
    }
}
