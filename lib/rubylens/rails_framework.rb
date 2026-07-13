# frozen_string_literal: true

module RubyLens
  module RailsFramework
    GEMS = %w[
      actioncable
      actionmailbox
      actionmailer
      actionpack
      actiontext
      actionview
      activejob
      activemodel
      activerecord
      activestorage
      activesupport
      railties
    ].freeze

    FOOTPRINT_ANCHORS = %w[actionpack activesupport railties].freeze
  end
end
