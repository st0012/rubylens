module Demo
  module Trackable
  end

  module Auditable
  end

  class Base
  end

  class Order < Base
    include Trackable
    prepend Auditable
    extend Trackable

    TOTAL = 1
    @class_state = :ready

    def total
      @total = Helper.calculate(TOTAL)
      @total ||= Helper.calculate(TOTAL)
      @read_only
    end
  end

  module Helper
    def self.calculate(value)
      value
    end
  end
end
