import VideoRoom from "@/components/call/VideoRoom";

export default function RoomPage({ params, searchParams }: { params: { id: string }, searchParams: { avatar?: string } }) {
    return <VideoRoom roomId={params.id} avatar={searchParams.avatar} />;
}
