<script>
	import { onMount, createEventDispatcher, getContext } from 'svelte'

	let verseCard

	let dispatch = createEventDispatcher()
	let appName = `فَذَكِّــرْ - faZakkir`

	let { verse, detail } = getContext('currentVerse')

	// Adjust text if it has mutliple lines
	function fragmentText(ctx, text, maxWidth) {
		let words = text.split(' '),
			lines = [],
			line = ""

		if (ctx.measureText(text).width < maxWidth) {
			return [text]
		}

		while (words.length > 0) {
			while (ctx.measureText(words[0]).width >= maxWidth) {
				let tmp = words[0]
				words[0] = tmp.slice(0, -1)

				if (words.length > 1) {
					words[1] = tmp.slice(-1) + words[1]
				} else {
					words.push(tmp.slice(-1))
				}
			}
			
			if (ctx.measureText(line + words[0]).width < maxWidth) {
				line += words.shift() + " "
			} else {
				lines.push(line)
				line = ""
			}

			if (words.length === 0) {
				lines.push(line)
			}
		}

		return lines
	}

	function drawVerse (canvas, lines) {
		let pattern = new Image()
		let ctx = canvas.getContext('2d')

		pattern.src = './core/assets/patterns/frame.png'
		ctx.fillStyle = "rgba(0, 0, 0, .8)"
		ctx.fillRect(0, 0, canvas.width, canvas.height)

		pattern.onload = function () {
			ctx.drawImage(pattern, 0, 0)

			ctx.fillStyle = "#FFFFFF"

			ctx.textAlign = 'right'
			ctx.font = "16px 'Cairo'"
			ctx.fillText(detail, canvas.width - 40, 50)

			ctx.font = "16px 'Cairo'"
			ctx.textAlign = 'left'
			ctx.fillText(appName, 40, 50)

			ctx.textAlign = 'center'

			ctx.font = "18px 'Cairo'"
			ctx.fillText(`بسم اللََّــه الرحمــان الرحــيـــم`, canvas.width / 2, canvas.height / 2.4)

			ctx.font = "44px 'Arial'"
			lines.forEach(function (line, i) {
				ctx.fillText(line, canvas.width / 2, (i + 5.7) * 56)
			})
		
			ctx.font = "12px 'Cairo'"
			ctx.fillText(`ثم تصدير هذه الصورة باستخدام اضافة [ ${appName} ]`, canvas.width / 2, canvas.height * .93)
		}
	}

	function makeCanvas () {
		let ctx = verseCard.getContext("2d"),
			 backImage = new Image(),
			 lines = fragmentText(ctx, `** ${verse} **`, verseCard.width * .35)

		verseCard.width = 600
		verseCard.height = 600

		backImage.crossOrigin = "Anonymous"
		backImage.src = 'https://source.unsplash.com/random/600x600/?quran,mosque'

		backImage.onload = function (){
			ctx.drawImage(backImage, 0, 0)
			drawVerse(verseCard, lines)
		}
	}

	function exportVerse () {
		verseCard.toBlob( function(blob) {
			
			let link = document.createElement('a')

			link.download = `${detail}.jpg`
			link.href = URL.createObjectURL(blob)
			link.click()

			URL.revokeObjectURL(link.href)
		}, 'image/jpeg', 1)

		closeDrawing()
	}

	function closeDrawing () {
		dispatch('close', false)
	}

	onMount(() => {
		makeCanvas()
	})
</script>

<section>
	<div class="backdrop">
		<div class="control">
			<span style="animation-delay: 0s" on:click={ closeDrawing } class="animate-right">
				<img src="./core/assets/svg/close.svg" alt="close">
			</span>

			<span style="animation-delay: .2s" on:click={ exportVerse } class="animate-right">
				<img src="./core/assets/svg/download.svg" alt="download">
			</span>
		</div>

		<canvas class="animate-down" bind:this={ verseCard }></canvas>
	</div>
</section>

<style>
	section {
		position: fixed;
		left: 0; right: 0;
		top: 0; bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, .5);
		z-index: 9999;
	}

	section .backdrop {
		display: flex;
		align-items: flex-start;
	}

	section .backdrop .control {
		width: 35px;
	}

	section .backdrop .control span {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 35px; height: 35px;
		border-radius: 35px;
		background: #ffff;
		color: #333;
		cursor: pointer;
		opacity: 0;
		font-size: 20px;
		margin-bottom: 10px;
	}

	section .control span img {
		width: 20px; height: 20px;
	}

	section .backdrop canvas {
		background: #fff;
		margin: 0 12px;
		z-index: 2
	}
</style>