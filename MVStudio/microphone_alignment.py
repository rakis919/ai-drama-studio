"""Reusable MV recording geometry requested by the user."""
ZH = '用户确认的录音空间构图：歌手在左后方，银色竖直侧向收音话筒在右前景，防喷罩位于话筒后方偏左、嘴与话筒之间，并被前景话筒部分遮挡。镜头看到朝向歌手的防喷罩内侧网面；不能呈现互不遮挡、横向排成一排的嘴、薄边网罩和话筒。拾音轴由歌手嘴部斜向右前方延伸，有明确纵深，话筒有效收音面朝向嘴部。嘴、网罩中心、有效收音面保持嘴部高度，嘴距罩约15厘米、罩距话筒约7厘米。保持已确认背景中的设备朝向与遮挡关系，通过机位呈现自然三分之二脸，不能为了露出双眼而扭转设备。'
EN = 'Approved recording perspective: singer behind-left, upright silver side-address microphone in the right foreground; pop filter behind-left of the microphone, between mouth and microphone, partly OCCLUDED BY the foreground microphone. The camera sees the SINGER-FACING INNER MESH surface of the broad oval filter. Mouth-to-filter-to-active-microphone-side follows a diagonal axis into depth, not three separate objects aligned flat across the image. Active pickup side faces the singer. Keep centers at mouth height, approximately 15 cm lips to filter and 7 cm filter to capsule. Preserve the approved background equipment orientation and depth overlap; choose camera position for a natural three-quarter face, never turn equipment to expose both eyes. '
NEGATIVE='话筒高于额头，话筒位于耳旁，话筒在歌手身后，嘴背对话筒，防喷罩与话筒不对齐，防喷罩高于头部，手持话筒，漂浮话筒'
def enabled(project,shot):
 policy=shot.get('generation',{}).get('microphone_alignment',project.get('suite',{}).get('project',{}).get('music_video',{}).get('microphone_alignment'))
 if policy is False:return False
 if isinstance(policy,dict):return policy.get('enabled',True)
 return project.get('suite',{}).get('project',{}).get('music_video',{}).get('mode')=='performance'
