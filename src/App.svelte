<script>
	import { setContext, onMount, afterUpdate } from 'svelte'

	import Header from './partials/Header.svelte'
	import Footer from './partials/Footer.svelte'

	import TheVerse from './components/TheVerse.svelte'
	import Explication from './components/Explication.svelte'

	import { verses } from './provider/verses.js'
	
	let currentVerse = verses[Math.floor(Math.random() * verses.length)]
	let changed = false

	function shuffleVerses () {
		currentVerse = verses[Math.floor(Math.random() * verses.length)]
		changed = false

		setTimeout(function () {
			changed = true
		}, 0)
	}

	onMount(function () {
		changed = true
	})
	
	afterUpdate(function () {
		setContext('currentVerse', currentVerse)
	})
</script>

<main>
	<Header />
	
	<section class="backdrop">
		<div class="container">
			{#if changed}
				<TheVerse on:shuffle={ shuffleVerses }/>
				<Explication/>
			{/if}
		</div>
	</section>

	<Footer />
</main>

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		font-family: sans-serif;
		outline: 0
	}

	:global(body) {
		--padding: clamp(30px, 100vw, 9%);
		user-select: none;
	}

	:global(.animate-up) {
		animation: .5s ease show-up forwards
	}

	:global(.animate-down) {
		animation: .5s ease show-down forwards
	}

	:global(.animate-left) {
		animation: .5s ease show-left forwards
	}

	:global(.animate-right) {
		animation: .5s ease show-right forwards
	}

	main {
		height: 100vh;
		background-image: url('https://source.unsplash.com/random/700x400/?quran,mosque');
		background-position: center;
		background-size: cover;
		position: relative;
		color: #fff
	}

	main section.backdrop {
		position: absolute;
		width: 100%; height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgb(0, 0, 0, .5);
		backdrop-filter: blur(12px);
	}

	main section.backdrop .container {
		display: grid;
		align-items: flex-start;
		grid-template-columns: repeat(3, auto);
		width: 100%;
		padding: 20px var(--padding);
	}

	@keyframes show-up {
		from {
			transform: translateY(-50px);
			opacity: 0;
		}

		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes show-right {
		from {
			transform: translateX(-50px);
			opacity: 0;
		}

		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@keyframes show-down {
		from {
			transform: translateY(50px);
			opacity: 0;
		}

		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes show-left {
		from {
			transform: translateX(50px);
			opacity: 0;
		}

		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>