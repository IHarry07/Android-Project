package com.example.android_project.ui.warehouse

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.ItemRepository
import com.example.android_project.model.Item
import com.example.android_project.ui.item.FridgeActivity
import com.example.android_project.ui.item.ItemActions
import com.example.android_project.ui.item.ItemAdapter
import com.example.android_project.ui.item.ItemFormActivity
import com.example.android_project.ui.item.Stock
import com.example.android_project.ui.item.StockLoader
import com.example.android_project.ui.main.MainTabsActivity
import kotlinx.coroutines.launch

/**
 * 창고 탭: 생활용품(공용·개인) 목록 + 냉장고 요약.
 * 음식(식재료)은 모두 냉장고 화면에서 관리하고, 창고에는 생활용품만 나온다.
 */
class WarehouseFragment : Fragment() {

    private lateinit var repo: ItemRepository
    private lateinit var adapter: ItemAdapter

    private lateinit var tvRoom: TextView
    private lateinit var tvFridgeSummary: TextView
    private lateinit var tvStatShared: TextView
    private lateinit var tvStatExpiring: TextView
    private lateinit var tvStatFood: TextView
    private lateinit var tvSharedCount: TextView
    private lateinit var tvEmpty: TextView

    private var stock: Stock? = null

    private val roomId: Int?
        get() = (activity as? MainTabsActivity)?.currentRoom?.roomId

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_warehouse, container, false)

    private lateinit var bell: com.example.android_project.ui.notification.NotificationBell

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        repo = ItemRepository(requireContext())
        bell = com.example.android_project.ui.notification.NotificationBell(this, view.findViewById(R.id.bell))

        tvRoom = view.findViewById(R.id.tvWarehouseRoom)
        tvFridgeSummary = view.findViewById(R.id.tvFridgeSummary)
        tvStatShared = view.findViewById(R.id.tvStatShared)
        tvStatExpiring = view.findViewById(R.id.tvStatExpiring)
        tvStatFood = view.findViewById(R.id.tvStatFood)
        tvSharedCount = view.findViewById(R.id.tvSharedCount)
        tvEmpty = view.findViewById(R.id.tvWarehouseEmpty)

        val room = (activity as? MainTabsActivity)?.currentRoom
        tvRoom.text = room?.let { "${it.roomName} · ${it.memberCount}명" }.orEmpty()

        adapter = ItemAdapter { item ->
            val id = roomId ?: return@ItemAdapter
            val activity = requireActivity() as AppCompatActivity
            // 다른 구성원의 개인 물품은 볼 수만 있다. (수정·삭제는 등록한 사람만)
            if (stock?.isEditable(item) == false) ItemActions.showReadOnly(activity, item)
            else ItemActions.show(activity, repo, id, item) { load() }
        }
        view.findViewById<RecyclerView>(R.id.rvItems).apply {
            this.adapter = this@WarehouseFragment.adapter
            layoutManager = LinearLayoutManager(requireContext())
        }

        view.findViewById<View>(R.id.cardFridge).setOnClickListener {
            val id = roomId ?: return@setOnClickListener
            startActivity(
                Intent(requireContext(), FridgeActivity::class.java)
                    .putExtra("roomId", id)
                    .putExtra("roomName", room?.roomName)
            )
        }

        // 창고에는 생활용품만 추가한다. (음식은 냉장고에서 추가)
        view.findViewById<View>(R.id.btnAddShared).setOnClickListener {
            val id = roomId ?: return@setOnClickListener
            startActivity(
                Intent(requireContext(), ItemFormActivity::class.java)
                    .putExtra(ItemFormActivity.EXTRA_ROOM_ID, id)
                    .putExtra(ItemFormActivity.EXTRA_OWNERSHIP, "SHARED")
                    .putExtra(ItemFormActivity.EXTRA_CATEGORY, "SUPPLY")
            )
        }
    }

    // 물품을 추가하고 돌아왔을 때도 최신 상태가 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        bell.refresh()
        load()
    }

    private fun load() {
        val id = roomId ?: return

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val (loaded, error) = StockLoader.load(repo, id)
                if (loaded == null) {
                    com.example.android_project.util.Msg.makeText(requireContext(), error, Toast.LENGTH_LONG).show()
                    return@launch
                }
                stock = loaded
                render()
            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(
                    requireContext(),
                    "서버에 연결할 수 없습니다.\n(${e.message})",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun render() {
        val data = stock ?: return

        // 창고: 생활용품만. 공용 + 내 개인 + 다른 구성원의 개인(읽기 전용)
        val supplies = data.all
            .filter { it.category == "SUPPLY" }
            .sortedWith(compareBy<Item>({ it.expiryDate == null }, { it.expiryDate }, { it.itemId }))

        tvStatShared.text = data.shared.count { it.category == "SUPPLY" }.toString()
        tvStatExpiring.text = data.expiringFood.size.toString()
        tvStatFood.text = (data.myFood.size + data.sharedFood.size + data.othersFood.size).toString()

        tvFridgeSummary.text =
            "내 음식 ${data.myFood.size}개 · 공용 음식 ${data.sharedFood.size}개 · 구성원 음식 ${data.othersFood.size}개\n" +
                "유통기한이 가까운 음식 ${data.expiringFood.size}개"

        adapter.submit(supplies)
        tvSharedCount.text = "전체 ${supplies.size}개"
        tvEmpty.visibility = if (supplies.isEmpty()) View.VISIBLE else View.GONE
    }
}
