# frozen_string_literal: true

require_relative "lib/rubylens/version"

Gem::Specification.new do |specification|
  specification.name = "rubylens"
  specification.version = RubyLens::VERSION
  specification.authors = ["RubyLens contributors"]
  specification.summary = "Turn a Ruby codebase into a self-contained interactive galaxy in one HTML file"
  specification.description = <<~DESCRIPTION.strip
    RubyLens uses Rubydex to map Ruby code and generate private, local-first
    data for local interactive reports and cinematic visual showcases.
  DESCRIPTION
  specification.homepage = "https://st0012.dev/rails-galaxy/"
  specification.license = "MIT"
  specification.required_ruby_version = ">= 3.2.0", "< 4.1.dev"
  specification.metadata["allowed_push_host"] = "https://rubygems.org"
  specification.metadata["homepage_uri"] = specification.homepage
  specification.metadata["rubygems_mfa_required"] = "true"

  specification.files = [
    "LICENSE.txt",
    "README.md",
    "assets/runtime/report.js",
    "assets/shells/report.html",
    "assets/shells/showcase.html",
    "assets/styles/report.css",
    "assets/styles/showcase.css",
    "exe/rubylens",
    *Dir["lib/**/*.rb"],
  ]
  specification.bindir = "exe"
  specification.executables = ["rubylens"]
  specification.require_paths = ["lib"]

  specification.add_dependency "rubydex", "= 0.2.9"
  specification.add_dependency "base64", ">= 0.2"
end
