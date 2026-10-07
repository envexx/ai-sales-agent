"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { BookingView } from "@/components/booking-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function BookingPage() {
  return (
    <>
      <PageHeader
        title="Booking"
        description="Jadwal konsultasi dan follow-up yang terdeteksi dari percakapan."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <BookingView />
      </PageBody>
    </>
  );
}
