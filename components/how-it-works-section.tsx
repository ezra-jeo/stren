const steps = [
  {
    number: "01",
    title: "Talk to the Stren team",
    description:
      "Tell us about your gym. We personally help configure your workspace and staff access.",
  },
  {
    number: "02",
    title: "Add your members",
    description:
      "Import existing members or add new ones. Each gets a QR code for check-in.",
  },
  {
    number: "03",
    title: "Start tracking operations",
    description:
      "Check-ins, payments, reports — everything updates in real-time from your phone.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-[#FAFAFA] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#FF6B1A]">
            How It Works
          </p>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[#1A1A1A] md:text-5xl text-balance">
            Get started in three simple steps
          </h2>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-20 max-w-3xl">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="group relative flex gap-8 pb-16 last:pb-0 md:gap-12"
            >
              {/* Vertical Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-[27px] top-16 h-[calc(100%-4rem)] w-px bg-[#E5E5E5] md:left-[35px]" />
              )}

              {/* Number */}
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border-2 border-[#E5E5E5] bg-[#FFFFFF] font-display text-lg font-extrabold text-[#FF6B1A] transition-all duration-300 group-hover:border-[#FF6B1A] group-hover:bg-[#FF6B1A] group-hover:text-[#FAFAFA] md:h-[72px] md:w-[72px] md:text-xl">
                {step.number}
              </div>

              {/* Content */}
              <div className="pt-2">
                <h3 className="font-display text-xl font-bold text-[#1A1A1A] md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-[#6B6B6B] md:text-lg">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
