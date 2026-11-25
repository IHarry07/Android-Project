package com.example.android_project.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.model.Room
import com.example.android_project.model.RoomMember
import com.example.android_project.ui.cleaning.CleaningSettingsActivity
import com.example.android_project.ui.cleaning.CleaningStatusActivity
import com.example.android_project.ui.room.RoomCreateActivity
import com.example.android_project.ui.room.RoomInviteCodeDialog
import com.example.android_project.ui.room.RoomJoinActivity
import com.example.android_project.ui.room.RoomMemberAdapter
import com.example.android_project.util.ApiError
import com.google.gson.Gson
import kotlinx.coroutines.launch

/**
 * 홈 탭.
 *  - 방이 없으면: 방 만들기 / 방 참가하기를 고르는 화면 (제목 "홈")
 *  - 방이 있으면: 방 정보 화면 (제목 "방 정보") — 방 소개, 구성원, 초대 코드 재생성(방장), 청소당번 설정,
 *    방 나가기(구성원) / 방 삭제하기(방장)
 */
class HomeFragment : Fragment() {

    private lateinit var roomRepository: RoomRepository

    private lateinit var tvTitle: TextView
    private lateinit var tvRoomEmpty: TextView
    private lateinit var layoutStart: View
    private lateinit var layoutRoomInfo: View

    private lateinit var tvInfoName: TextView
    private lateinit var tvInfoDescription: TextView
    private lateinit var tvInfoRole: TextView
    private lateinit var tvInfoMemberCount: TextView
    private lateinit var rvRoomMembers: RecyclerView
    private lateinit var btnInvite: View
    private lateinit var ivEditRoom: View
    private lateinit var btnLeaveRoom: Button
    private lateinit var btnDeleteRoom: Button

    private var room: Room? = null

    // 서버에서 불러온 구성원. 아직 불러오지 못했으면 null
    private var members: List<RoomMember>? = null

    // 요청이 진행 중일 때 버튼을 또 누르지 못하게 한다.
    private var busy = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_home, container, false)

    private lateinit var bell: com.example.android_project.ui.notification.NotificationBell

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        roomRepository = RoomRepository(requireContext())
        bell = com.example.android_project.ui.notification.NotificationBell(this, view.findViewById(R.id.bell))

        tvTitle = view.findViewById(R.id.tvHomeTitle)
        tvRoomEmpty = view.findViewById(R.id.tvRoomEmpty)
        layoutStart = view.findViewById(R.id.layoutStart)
        layoutRoomInfo = view.findViewById(R.id.layoutRoomInfo)

        tvInfoName = view.findViewById(R.id.tvInfoName)
        tvInfoDescription = view.findViewById(R.id.tvInfoDescription)
        tvInfoRole = view.findViewById(R.id.tvInfoRole)
        tvInfoMemberCount = view.findViewById(R.id.tvInfoMemberCount)
        rvRoomMembers = view.findViewById(R.id.rvRoomMembers)
        btnInvite = view.findViewById(R.id.btnInvite)
        ivEditRoom = view.findViewById(R.id.ivEditRoom)
        ivEditRoom.setOnClickListener { openRoomEdit() }
        btnLeaveRoom = view.findViewById(R.id.btnLeaveRoom)
        btnDeleteRoom = view.findViewById(R.id.btnDeleteRoom)

        rvRoomMembers.layoutManager = LinearLayoutManager(requireContext())

        // 방이 없을 때
        view.findViewById<View>(R.id.btnCreateRoom).setOnClickListener {
            startActivity(Intent(requireContext(), RoomCreateActivity::class.java))
        }
        view.findViewById<View>(R.id.btnJoinRoom).setOnClickListener {
            startActivity(Intent(requireContext(), RoomJoinActivity::class.java))
        }

        // 방이 있을 때
        btnInvite.setOnClickListener { showInviteDialog() }
        view.findViewById<Button>(R.id.btnCleaningStatus).setOnClickListener { openCleaningStatus() }
        view.findViewById<Button>(R.id.btnMemos).setOnClickListener {
            val current = room ?: return@setOnClickListener
            startActivity(
                Intent(requireContext(), com.example.android_project.ui.memo.MemoListActivity::class.java)
                    .putExtra(com.example.android_project.ui.memo.MemoListActivity.EXTRA_ROOM_ID, current.roomId)
            )
        }
        view.findViewById<Button>(R.id.btnCleaningSettings).setOnClickListener { openCleaningSettings() }
        btnDeleteRoom.setOnClickListener { onDeleteRoomClicked() }
        btnLeaveRoom.setOnClickListener { showLeaveDialog() }
    }

    // 방을 만들거나 참가하고 돌아왔을 때도 최신 상태가 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        bell.refresh()
        loadMyRoom()
    }

    // ---------------------------------------------------------------
    // 내 방 불러오기
    // ---------------------------------------------------------------

    // showLoading: 불러오는 동안 안내 문구를 보일지 (조용히 새로 고칠 때는 false)
    private fun loadMyRoom(showLoading: Boolean = true) {
        if (showLoading) showMessage("방 정보를 불러오는 중입니다.")

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = roomRepository.getMyRoom()

                if (response == null) {
                    showMessage("로그인이 필요합니다.")
                    return@launch
                }

                if (!response.isSuccessful) {
                    val message = ApiError.messageOf(response, "방 정보를 불러오지 못했습니다.")
                    showMessage(message)
                    toast(message)
                    return@launch
                }

                val roomJson = response.body()?.get("room")

                if (roomJson == null || roomJson.isJsonNull) {
                    // 아직 가입한 방이 없다.
                    room = null
                    members = null
                    showStart()
                    bell.setVisible(false)
                    (activity as? MainTabsActivity)?.onRoomLoaded(null)
                } else {
                    val loaded = Gson().fromJson(roomJson, Room::class.java)
                    room = loaded
                    showRoomInfo(loaded)
                    bell.setVisible(true)
                    (activity as? MainTabsActivity)?.onRoomLoaded(loaded)
                    loadMembers(loaded.roomId)
                }

            } catch (e: Exception) {
                showMessage("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    private fun showMessage(message: String) {
        tvRoomEmpty.text = message
        tvRoomEmpty.visibility = View.VISIBLE
    }

    private fun showStart() {
        tvTitle.text = "홈"
        tvRoomEmpty.visibility = View.GONE
        layoutRoomInfo.visibility = View.GONE
        layoutStart.visibility = View.VISIBLE
    }

    // 방 정보 수정 (방장만). 돌아오면 onResume 에서 방 정보를 다시 불러온다.
    private fun openRoomEdit() {
        val r = room ?: return
        startActivity(
            Intent(requireContext(), com.example.android_project.ui.room.RoomEditActivity::class.java)
                .putExtra(com.example.android_project.ui.room.RoomEditActivity.EXTRA_ROOM_ID, r.roomId)
                .putExtra(com.example.android_project.ui.room.RoomEditActivity.EXTRA_NAME, r.roomName)
                .putExtra(com.example.android_project.ui.room.RoomEditActivity.EXTRA_DESCRIPTION, r.description.orEmpty())
                .putExtra(com.example.android_project.ui.room.RoomEditActivity.EXTRA_CAPACITY, r.capacity)
                .putExtra(com.example.android_project.ui.room.RoomEditActivity.EXTRA_MEMBER_COUNT, r.memberCount)
        )
    }

    private fun showRoomInfo(r: Room) {
        tvTitle.text = "방 정보"
        tvRoomEmpty.visibility = View.GONE
        layoutStart.visibility = View.GONE
        layoutRoomInfo.visibility = View.VISIBLE

        tvInfoName.text = r.roomName

        if (r.description.isNullOrBlank()) {
            tvInfoDescription.visibility = View.GONE
        } else {
            tvInfoDescription.visibility = View.VISIBLE
            tvInfoDescription.text = "방 소개: ${r.description}"
        }

        tvInfoMemberCount.text = "참여 인원: ${r.memberCount}명 / 최대 ${r.capacity}명"
        applyRole(r.isOwner)
    }

    // 내 역할(방장 여부)에 맞게 역할 문구와 버튼을 보여준다.
    private fun applyRole(isOwner: Boolean) {
        tvInfoRole.text = if (isOwner) "방장" else "일반 멤버"
        btnInvite.visibility = if (isOwner) View.VISIBLE else View.GONE
        ivEditRoom.visibility = if (isOwner) View.VISIBLE else View.GONE
        btnDeleteRoom.visibility = if (isOwner) View.VISIBLE else View.GONE
        btnLeaveRoom.visibility = if (isOwner) View.GONE else View.VISIBLE
    }

    // ---------------------------------------------------------------
    // 구성원 목록
    // ---------------------------------------------------------------

    private fun loadMembers(roomId: Int) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = roomRepository.getRoomMembers(roomId)

                if (response == null) {
                    toast("로그인이 필요합니다.")
                    return@launch
                }

                if (!response.isSuccessful) {
                    toast(ApiError.messageOf(response, "구성원을 불러오지 못했습니다."))
                    return@launch
                }

                val membersJson = response.body()?.getAsJsonArray("members")

                val loaded: List<RoomMember> =
                    if (membersJson == null) emptyList()
                    else Gson().fromJson(membersJson, Array<RoomMember>::class.java).toList()

                members = loaded
                rvRoomMembers.adapter = RoomMemberAdapter(loaded)
                room?.let { tvInfoMemberCount.text = "참여 인원: ${loaded.size}명 / 최대 ${it.capacity}명" }

            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})", long = true)
            }
        }
    }

    // ---------------------------------------------------------------
    // 청소당번 설정 / 초대 코드 재생성
    // ---------------------------------------------------------------

    private fun openCleaningStatus() {
        val current = room ?: return
        startActivity(
            Intent(requireContext(), CleaningStatusActivity::class.java)
                .putExtra(CleaningStatusActivity.EXTRA_ROOM_ID, current.roomId)
                .putExtra(CleaningStatusActivity.EXTRA_ROOM_NAME, current.roomName)
        )
    }

    private fun openCleaningSettings() {
        val current = room ?: return
        startActivity(
            Intent(requireContext(), CleaningSettingsActivity::class.java)
                .putExtra(CleaningSettingsActivity.EXTRA_ROOM_ID, current.roomId)
                .putExtra(CleaningSettingsActivity.EXTRA_ROOM_NAME, current.roomName)
        )
    }

    // 방장이 초대 코드를 만든다. 안내와 코드 확인을 팝업 하나에서 처리한다.
    private fun showInviteDialog() {
        val current = room ?: return
        RoomInviteCodeDialog.showManage(requireContext()) { done ->
            viewLifecycleOwner.lifecycleScope.launch {
                try {
                    val response = roomRepository.createInvitation(current.roomId)
                    if (response == null) {
                        done(null, "로그인이 필요합니다.")
                    } else if (response.isSuccessful) {
                        val code = response.body()
                            ?.getAsJsonObject("invite")
                            ?.get("code")
                            ?.takeIf { it.isJsonPrimitive }
                            ?.asString
                        if (code == null) done(null, "새 초대 코드를 확인할 수 없어요.") else done(code, null)
                    } else {
                        done(null, ApiError.messageOf(response, "초대 코드를 만들지 못했어요."))
                    }
                } catch (e: Exception) {
                    done(null, "서버에 연결할 수 없어요.")
                }
            }
        }
    }
    // ---------------------------------------------------------------
    // 방 삭제 (방장)
    //   서버에는 방 삭제 API가 따로 없다. 방장이 혼자 남은 상태에서 방을 나가면 방이 삭제된다.
    //   다른 구성원이 있으면 먼저 방장을 넘겨야 한다.
    // ---------------------------------------------------------------

    private fun onDeleteRoomClicked() {
        val list = members

        if (list == null) {
            toast("구성원 정보를 불러오는 중이에요. 잠시 후 다시 눌러 주세요.")
            return
        }

        if (list.size <= 1) {
            showDeleteAloneDialog()
        } else {
            showNeedTransferDialog(list.filter { !it.isOwner })
        }
    }

    // 혼자 남은 방장: 방을 삭제한다.
    private fun showDeleteAloneDialog() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("방 삭제")
            .setMessage(
                "방을 삭제할까요?\n" +
                    "방에 있는 물품, 일정, 청소, 지출 기록이 모두 삭제되고 되돌릴 수 없어요."
            )
            .setPositiveButton("삭제") { _, _ -> requestLeave(null) }
            .setNegativeButton("취소", null)
            .show()
    }

    // 구성원이 있는 방: 삭제할 수 없으니 방장을 넘기도록 안내한다.
    private fun showNeedTransferDialog(candidates: List<RoomMember>) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("방 삭제")
            .setMessage(
                "다른 구성원이 있는 방은 삭제할 수 없어요.\n" +
                    "방장을 다른 구성원에게 넘기면 방에서 나갈 수 있어요."
            )
            .setPositiveButton("방장 넘기기") { _, _ -> showPickNewOwnerDialog(candidates) }
            .setNegativeButton("취소", null)
            .show()
    }

    // 방장을 넘길 구성원을 고른다.
    private fun showPickNewOwnerDialog(candidates: List<RoomMember>) {
        if (candidates.isEmpty()) {
            toast("방장을 넘길 구성원이 없어요.")
            return
        }

        val names = candidates.map { it.nickname }.toTypedArray()

        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("방장을 넘길 구성원")
            .setItems(names) { _, which -> showConfirmTransferDialog(candidates[which]) }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showConfirmTransferDialog(member: RoomMember) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("방장 넘기기")
            .setMessage(
                "${member.nickname}님에게 방장을 넘길까요?\n" +
                    "넘긴 뒤에는 내가 방장이 아니게 돼요."
            )
            .setPositiveButton("넘기기") { _, _ -> requestTransferOwner(member) }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun requestTransferOwner(member: RoomMember) {
        val current = room ?: return

        runRequest {
            val response = roomRepository.transferOwner(current.roomId, member.userId)

            if (response == null) {
                toast("로그인이 필요합니다.")
                return@runRequest
            }

            if (response.isSuccessful) {
                toast("${member.nickname}님에게 방장을 넘겼어요.")

                // 이제 나는 일반 구성원이다. 방 정보와 구성원 표시를 조용히 새로 고친다.
                loadMyRoom(showLoading = false)
            } else {
                toast(ApiError.parse(response, "방장을 넘기지 못했어요.").message)
            }
        }
    }

    // ---------------------------------------------------------------
    // 방 나가기 (일반 구성원)
    // ---------------------------------------------------------------

    private fun showLeaveDialog() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("방 나가기")
            .setMessage(
                "정말 이 방에서 나가시겠습니까?\n" +
                    "나가면 내가 등록한 개인 물품과 일정이 삭제돼요."
            )
            .setPositiveButton("나가기") { _, _ -> requestLeave(null) }
            .setNegativeButton("취소", null)
            .show()
    }

    // 방 나가기 요청. 방장이 혼자 남은 상태라면 방이 삭제된다.
    // sharedItems: 공용 물품 처리 방법("TRANSFER" 또는 "DELETE"). 처음에는 null로 보내고, 서버가 요구하면 다시 보낸다.
    private fun requestLeave(sharedItems: String?) {
        val current = room ?: return

        runRequest {
            val response = roomRepository.leaveRoom(current.roomId, sharedItems)

            if (response == null) {
                toast("로그인이 필요합니다.")
                return@runRequest
            }

            if (response.isSuccessful) {
                val roomDeleted = response.body()
                    ?.get("roomDeleted")
                    ?.takeIf { it.isJsonPrimitive }
                    ?.asBoolean
                    ?: false

                toast(if (roomDeleted) "방이 삭제되었어요." else "방에서 나갔어요.")

                // 방이 없어졌으니 "방 만들기 / 방 참가하기" 화면으로 돌아간다.
                loadMyRoom(showLoading = false)
                return@runRequest
            }

            val error = ApiError.parse(response, "방에서 나가지 못했어요.")

            when (error.code) {
                // 내가 등록한 공용 물품의 처리 방법을 골라야 한다.
                "SHARED_ITEMS_CHOICE_REQUIRED" ->
                    showSharedItemsChoiceDialog(
                        error.details?.get("sharedItemCount")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0
                    )

                // 정산이 끝나지 않은 지출이 있어서 나갈 수 없다.
                "UNSETTLED_EXPENSES" ->
                    showUnsettledDialog(
                        error.details?.get("owes")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0,
                        error.details?.get("owed")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0
                    )

                // 방장 정보가 오래되어 서버와 어긋난 경우 등: 서버 메시지를 그대로 보여준다.
                else -> toast(error.message, long = true)
            }
        }
    }

    // 내가 등록한 공용 물품을 방장에게 넘길지 삭제할지 고른다.
    private fun showSharedItemsChoiceDialog(count: Int) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("공용 물품 처리")
            .setMessage(
                "내가 등록한 공용 물품이 ${count}개 있어요.\n" +
                    "방장에게 넘길지, 삭제할지 골라 주세요."
            )
            .setPositiveButton("방장에게 넘기기") { _, _ -> requestLeave("TRANSFER") }
            .setNegativeButton("삭제하기") { _, _ -> requestLeave("DELETE") }
            .setNeutralButton("취소", null)
            .show()
    }

    // 정산이 끝나지 않아서 나갈 수 없다.
    private fun showUnsettledDialog(owes: Int, owed: Int) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("나갈 수 없어요")
            .setMessage(
                "정산이 끝나지 않은 지출이 있어요.\n" +
                    "내가 낼 정산 ${owes}건, 내가 받을 정산 ${owed}건\n\n" +
                    "정산을 마친 뒤 다시 시도해 주세요."
            )
            .setPositiveButton("확인", null)
            .show()
    }

    // ---------------------------------------------------------------
    // 공통
    // ---------------------------------------------------------------

    // 서버 요청을 한 번에 하나만 실행하고, 실행하는 동안 버튼을 막는다.
    private fun runRequest(block: suspend () -> Unit) {
        if (busy) return

        busy = true
        setButtonsEnabled(false)

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                block()
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})", long = true)
            } finally {
                busy = false
                if (view != null) setButtonsEnabled(true)
            }
        }
    }

    private fun setButtonsEnabled(enabled: Boolean) {
        btnInvite.isEnabled = enabled
        btnLeaveRoom.isEnabled = enabled
        btnDeleteRoom.isEnabled = enabled
    }

    private fun toast(message: String, long: Boolean = false) {
        if (!isAdded) return
        com.example.android_project.util.Msg.makeText(
            requireContext(),
            message,
            if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
        ).show()
    }
}
