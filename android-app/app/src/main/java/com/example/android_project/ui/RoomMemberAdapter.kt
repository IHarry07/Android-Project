package com.example.android_project.ui.room

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.lifecycle.findViewTreeLifecycleOwner
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.model.RoomMember

class RoomMemberAdapter(
    private val memberList: List<RoomMember>
) : RecyclerView.Adapter<RoomMemberAdapter.MemberViewHolder>() {

    class MemberViewHolder(itemView: View) :
        RecyclerView.ViewHolder(itemView) {

        val tvMemberNickname: TextView =
            itemView.findViewById(R.id.tvMemberNickname)

        val tvMemberJoinedAt: TextView =
            itemView.findViewById(R.id.tvMemberJoinedAt)

        val tvMemberRole: TextView =
            itemView.findViewById(R.id.tvMemberRole)

        val ivPhoto: android.widget.ImageView = itemView.findViewById(R.id.ivMemberPhoto)
        val ivPlaceholder: View = itemView.findViewById(R.id.ivMemberPlaceholder)
    }

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): MemberViewHolder {

        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_room_member, parent, false)

        return MemberViewHolder(view)
    }

    override fun onBindViewHolder(
        holder: MemberViewHolder,
        position: Int
    ) {
        val member = memberList[position]

        holder.tvMemberNickname.text = member.nickname

        // 프로필 사진: 있고 보여도 되는 경우에만 보인다. 없으면 기본 아이콘.
        val owner = holder.itemView.findViewTreeLifecycleOwner()
        if (owner != null) {
            com.example.android_project.util.PhotoLoader.bind(
                owner, holder.itemView.context, holder.ivPhoto, holder.ivPlaceholder, member.userId, member.photoVersion
            )
        }

        holder.tvMemberJoinedAt.text =
            "가입일: ${member.joinedAt}"

        holder.tvMemberRole.text =
            if (member.isOwner) "방장" else "일반 멤버"
    }

    override fun getItemCount(): Int {
        return memberList.size
    }
}
