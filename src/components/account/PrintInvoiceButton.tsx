"use client";

export default function PrintInvoiceButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-6 text-sm font-semibold text-white transition hover:bg-gray-700"
    >
      Print invoice
    </button>
  );
}