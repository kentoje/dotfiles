local status, comment = pcall(require, 'comment')

if (not status) then return end

comment.setup()
